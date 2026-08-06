// A4(1) — the Dashboard S-curve. These tests exist because the panel they
// cover spent its whole life SYNTHESIZING its own data (`Math.pow(t, 0.85)`
// for planned, a linear ramp from one scalar for actual) and nothing could
// have caught it: a fabricated curve renders perfectly, passes every build,
// and looks healthiest exactly when the database is emptiest.
//
// So the replacement is asserted against hand-computed numbers rather than
// eyeballed. The two properties that matter most are the ones a screenshot
// cannot show: that a missing input yields NO SERIES (not a default shape),
// and that the actual line never runs past today.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sCurveSeries } from '../src/lib/progressReport.js'

// One project, 2026-01-01 + 10 weeks (70 days) -> ends 2026-03-12.
const P = { id: 'p1', name: 'Alpha', start_date: '2026-01-01', total_weeks: 10 }

test('T-SC1 — no planned scope: no series, and the reason says which input is missing', () => {
  const r = sCurveSeries({ projects: [P], plannedByProject: {}, installs: [], asOf: '2026-02-01' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_scope')
  assert.equal(r.points, undefined, 'a refusal must not carry a series')
})

test('T-SC2 — scope but no schedule: no series, and the unscheduled project is named', () => {
  const r = sCurveSeries({
    projects: [{ id: 'p1', name: 'Alpha', start_date: null, total_weeks: null }],
    plannedByProject: { p1: 100 }, plannedByScope: { s1: 100 },
    installs: [{ scope_id: 's1', entry_date: '2026-02-01', qty: 5 }], asOf: '2026-02-01',
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_schedule')
  assert.equal(r.unscheduled.length, 1)
})

test('T-SC3 — a zero total_weeks is not a schedule', () => {
  const r = sCurveSeries({
    projects: [{ id: 'p1', start_date: '2026-01-01', total_weeks: 0 }],
    plannedByProject: { p1: 100 }, plannedByScope: { s1: 100 },
    installs: [{ scope_id: 's1', entry_date: '2026-01-05', qty: 5 }], asOf: '2026-02-01',
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_schedule')
})

test('T-SC4 — schedule and scope but nothing logged: still no series, and it says so', () => {
  const r = sCurveSeries({
    projects: [P], plannedByProject: { p1: 100 }, plannedByScope: { s1: 100 },
    installs: [], asOf: '2026-02-01',
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_installs')
  assert.equal(r.plannedTotal, 100, 'the refusal still reports what IS known')
})

test('T-SC5 — an undated install row cannot place a point on a time axis', () => {
  const r = sCurveSeries({
    projects: [P], plannedByProject: { p1: 100 }, plannedByScope: { s1: 100 },
    installs: [{ scope_id: 's1', entry_date: null, qty: 40 }], asOf: '2026-02-01',
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_installs')
})

test('T-SC6 — planned is linear over the project\'s own window, to the exact unit', () => {
  const r = sCurveSeries({
    projects: [P], plannedByProject: { p1: 700 }, plannedByScope: { s1: 700 },
    installs: [{ scope_id: 's1', entry_date: '2026-01-01', qty: 1 }], asOf: '2026-03-12',
  })
  assert.equal(r.ok, true)
  assert.equal(r.start, '2026-01-01')
  assert.equal(r.end, '2026-03-12')            // 70 days after the start
  assert.equal(r.points[0].date, '2026-01-01')
  assert.equal(r.points[0].planned, 0)
  // 700 units over 70 days = 10/day. One week in: 70. Five weeks in: 350.
  assert.equal(r.points[1].planned, 70)
  assert.equal(r.points[5].planned, 350)
  assert.equal(r.points[r.points.length - 1].planned, 700)
})

test('T-SC7 — actual is cumulative and CAPPED PER SCOPE, matching the KPI ring', () => {
  const r = sCurveSeries({
    projects: [P], plannedByProject: { p1: 100 },
    plannedByScope: { s1: 60, s2: 40 },
    installs: [
      { scope_id: 's1', entry_date: '2026-01-08', qty: 30 },
      { scope_id: 's2', entry_date: '2026-01-15', qty: 10 },
      // 90 logged on a scope planned for 60 — the overshoot must not reach the curve
      { scope_id: 's1', entry_date: '2026-01-22', qty: 90 },
    ],
    asOf: '2026-03-12',
  })
  assert.equal(r.ok, true)
  assert.equal(r.points[1].actual, 30)   // 2026-01-08
  assert.equal(r.points[2].actual, 40)   // +10
  assert.equal(r.points[3].actual, 70)   // s1 capped at 60, so +30 not +90
  assert.equal(r.installedNow, 70, 'the endpoint can never exceed total planned scope')
})

test('T-SC8 — the actual line stops at today; the future is null, not zero', () => {
  const r = sCurveSeries({
    projects: [P], plannedByProject: { p1: 700 }, plannedByScope: { s1: 700 },
    installs: [{ scope_id: 's1', entry_date: '2026-01-08', qty: 100 }],
    asOf: '2026-01-22',
  })
  assert.equal(r.ok, true)
  const drawn = r.points.filter((p) => p.actual != null)
  assert.ok(drawn.every((p) => p.date <= '2026-01-22'))
  assert.ok(r.points.some((p) => p.actual === null), 'points past today must be null so nothing is plotted there')
  // a null is not a zero: zero would draw the line back down to the axis
  assert.notEqual(r.points[r.points.length - 1].actual, 0)
})

test('T-SC9 — NOW is where today falls on the real timeline, not the middle of the box', () => {
  const mk = (asOf) => sCurveSeries({
    projects: [P], plannedByProject: { p1: 700 }, plannedByScope: { s1: 700 },
    installs: [{ scope_id: 's1', entry_date: '2026-01-02', qty: 10 }], asOf,
  })
  assert.equal(mk('2026-01-01').nowFrac, 0)
  assert.equal(Math.round(mk('2026-02-05').nowFrac * 1000) / 1000, 0.5)  // day 35 of 70
  assert.equal(mk('2026-09-01').nowFrac, 1, 'past the end pins to the right edge, it does not wrap')
})

test('T-SC10 — two projects with different windows sum into one portfolio plan', () => {
  const q = { id: 'p2', name: 'Beta', start_date: '2026-02-05', total_weeks: 5 }
  const r = sCurveSeries({
    projects: [P, q], plannedByProject: { p1: 700, p2: 350 },
    plannedByScope: { s1: 700, s2: 350 }, scopeProject: { s1: 'p1', s2: 'p2' },
    installs: [{ scope_id: 's1', entry_date: '2026-01-08', qty: 10 }],
    asOf: '2026-03-12',
  })
  assert.equal(r.ok, true)
  assert.equal(r.start, '2026-01-01')
  assert.equal(r.end, '2026-03-12')   // both windows end the same day here
  assert.equal(r.plannedTotal, 1050)
  // Beta has not started at week 1, so week 1 is Alpha alone.
  assert.equal(r.points[1].planned, 70)
  assert.equal(r.points[r.points.length - 1].planned, 1050)
})

test('T-SC11 — a long programme is sampled, not truncated: it still ends at the end date', () => {
  const long = { id: 'p1', start_date: '2020-01-01', total_weeks: 520 }  // 10 years
  const r = sCurveSeries({
    projects: [long], plannedByProject: { p1: 1000 }, plannedByScope: { s1: 1000 },
    installs: [{ scope_id: 's1', entry_date: '2021-01-01', qty: 100 }], asOf: '2026-01-01',
  })
  assert.equal(r.ok, true)
  assert.ok(r.points.length <= 54, `expected a sampled series, got ${r.points.length} points`)
  assert.equal(r.points[r.points.length - 1].date, r.end)
  assert.equal(r.points[r.points.length - 1].planned, 1000)
})

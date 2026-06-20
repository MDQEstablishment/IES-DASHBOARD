// Tiny pub/sub toast bus. <Toaster/> subscribes; toast() can be called anywhere.
let id = 0
const listeners = new Set()
let items = []

function emit() { listeners.forEach((l) => l(items)) }

export function toast(message, type = 'ok', ttl = 3200) {
  const t = { id: ++id, message, type }
  items = [...items, t]
  emit()
  setTimeout(() => {
    items = items.filter((x) => x.id !== t.id)
    emit()
  }, ttl)
}

export function subscribeToasts(fn) {
  listeners.add(fn)
  fn(items)
  return () => listeners.delete(fn)
}

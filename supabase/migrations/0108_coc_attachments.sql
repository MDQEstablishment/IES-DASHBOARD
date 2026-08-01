-- 9H(3) — the certificate's attachments row, the signatory's mobile/title, and
-- the approved-equipment fallback for AC capacity/efficiency.
--
-- ATTACHMENTS: docPdf.js has always drawn the 5+3 checkbox row
-- (مواصفات / عينات / مخططات تفصيلية / صور / مرجع للكميات / تقرير إختبار عينات /
-- تقرير فحص عينات / أخرى) with stable ids, and assembleCocPdfData has always
-- passed `attachmentsChecked: []`. Every certificate printed eight empty boxes.
--
-- Stored in TWO places on purpose:
--   coc_project_settings.default_attachments — what this project usually
--     attaches, so a bulk run of 200 certificates is one decision, not 200.
--   cocs.attachments_checked — snapshotted onto each certificate as it is
--     generated, so re-rendering a revision reproduces the boxes that were
--     ticked at the time rather than whatever the project default says today.
-- A generated PDF is a record; it must not silently change underneath itself.

alter table public.cocs
  add column if not exists attachments_checked text[] not null default '{}';

alter table public.coc_project_settings
  add column if not exists default_attachments text[] not null default '{}';

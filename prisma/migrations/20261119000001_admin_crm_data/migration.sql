-- Старі статуси -> нові; публічний номер заявки = шестизначний порядковий (000001, 000002, ...)
UPDATE "Request" SET "status" = 'done' WHERE "status" = 'closed';
UPDATE "Request" SET "status" = 'failed' WHERE "status" = 'cancelled';
UPDATE "Request" SET "publicReference" = lpad("number"::text, 6, '0');

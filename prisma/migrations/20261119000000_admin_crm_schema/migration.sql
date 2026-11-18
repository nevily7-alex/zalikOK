-- Нові статуси, порядковий номер заявки, дедлайн виконання, пріоритет, передоплата, нагадування
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE "Request" ADD COLUMN "number" SERIAL NOT NULL;
ALTER TABLE "Request" ADD COLUMN "dueDate" DATE;
ALTER TABLE "Request" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Request" ADD COLUMN "prepayment" DECIMAL(10,2);
ALTER TABLE "Request" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Request_number_key" ON "Request"("number");
CREATE INDEX "Request_status_dueDate_idx" ON "Request"("status", "dueDate");

ALTER TABLE "NotificationOutbox" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'new_request';

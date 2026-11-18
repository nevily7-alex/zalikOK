-- Орієнтовний розрахунок із форми заявки (перераховується на сервері за тими самими тарифами)
ALTER TABLE "Request" ADD COLUMN "clientEstimate" JSONB;

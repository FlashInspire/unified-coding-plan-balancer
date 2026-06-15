-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "contextLength" INTEGER NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "topK" INTEGER,
    "minP" DOUBLE PRECISION,
    "frequencyPenalty" DOUBLE PRECISION,
    "presencePenalty" DOUBLE PRECISION,
    "repetitionPenalty" DOUBLE PRECISION,
    "reasoningEffort" TEXT,
    "includeReasoningInRequest" BOOLEAN NOT NULL DEFAULT false,
    "vision" BOOLEAN NOT NULL DEFAULT false,
    "enableThinking" BOOLEAN,
    "thinkingBudget" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrlOpenai" TEXT,
    "apiKeyOpenai" TEXT,
    "baseUrlAnthropic" TEXT,
    "apiKeyAnthropic" TEXT,
    "headersTemplate" TEXT NOT NULL,
    "rollingQuota" BIGINT,
    "weekQuota" BIGINT,
    "monthQuota" BIGINT,
    "rollingQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "weekQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "monthQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rollingQuotaResetAt" TIMESTAMP(3),
    "weekQuotaResetAt" TIMESTAMP(3),
    "monthQuotaResetAt" TIMESTAMP(3),
    "planStartTime" TIMESTAMP(3),
    "usageMode" TEXT NOT NULL DEFAULT 'request',
    "rollingCacheInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rollingOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "weekCacheInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "weekOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "monthCacheInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "monthOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quotaRunningOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "realModelId" TEXT,
    "contextLengthOverride" INTEGER,
    "maxTokensOverride" INTEGER,
    "temperatureOverride" DOUBLE PRECISION,
    "topPOverride" DOUBLE PRECISION,
    "topKOverride" INTEGER,
    "reasoningEffortOverride" TEXT,
    "includeReasoningInRequestOverride" BOOLEAN,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "apiStyle" TEXT NOT NULL DEFAULT 'auto',
    "feeRateInput" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "feeRateCachedInput" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "feeRateOutput" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "rollingInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingQuotaResetAt" TIMESTAMP(3),
    "weekQuotaResetAt" TIMESTAMP(3),
    "monthQuotaResetAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rollingQuota" BIGINT,
    "weekQuota" BIGINT,
    "monthQuota" BIGINT,
    "rollingInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthInputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthCachedReadTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthOutputTokensUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rollingQuotaResetAt" TIMESTAMP(3),
    "weekQuotaResetAt" TIMESTAMP(3),
    "monthQuotaResetAt" TIMESTAMP(3),
    "quotaMultiplierInput" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "quotaMultiplierCachedRead" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "quotaMultiplierOutput" DOUBLE PRECISION NOT NULL DEFAULT 4.0,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "StickyRoute" (
    "apiKeyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "pmId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickyRoute_pkey" PRIMARY KEY ("apiKeyId","modelId")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "request_log" (
    "id" BIGSERIAL NOT NULL,
    "ts" BIGINT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "real_model_id" TEXT NOT NULL,
    "api_mode_in" TEXT NOT NULL,
    "api_mode_out" TEXT NOT NULL,
    "stream" BOOLEAN NOT NULL,
    "status" INTEGER NOT NULL,
    "error_code" TEXT,
    "ttft_ms" INTEGER,
    "tps_out" DOUBLE PRECISION,
    "latency_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "user_agent" TEXT,
    "api_key_name" TEXT,
    "provider_name" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "aborted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "request_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_minute" (
    "minute" INTEGER NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "requests_ok" INTEGER NOT NULL DEFAULT 0,
    "requests_err" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "ttft_ms_sum" INTEGER NOT NULL DEFAULT 0,
    "ttft_ms_count" INTEGER NOT NULL DEFAULT 0,
    "tps_out_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tps_out_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_minute_pkey" PRIMARY KEY ("minute","api_key_id","provider_id","model_id")
);

-- CreateTable
CREATE TABLE "aggregate_report" (
    "id" SERIAL NOT NULL,
    "granularity" TEXT NOT NULL,
    "period_start" BIGINT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "latest" BOOLEAN NOT NULL DEFAULT false,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "requests_ok" INTEGER NOT NULL DEFAULT 0,
    "requests_err" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "ttft_ms_sum" INTEGER NOT NULL DEFAULT 0,
    "ttft_ms_count" INTEGER NOT NULL DEFAULT 0,
    "tps_out_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tps_out_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregate_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderModel_modelId_idx" ON "ProviderModel"("modelId");

-- CreateIndex
CREATE INDEX "ProviderModel_providerId_idx" ON "ProviderModel"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderModel_modelId_providerId_key" ON "ProviderModel"("modelId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_ownerId_idx" ON "ApiKey"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "StickyRoute_expiresAt_idx" ON "StickyRoute"("expiresAt");

-- CreateIndex
CREATE INDEX "request_log_ts_idx" ON "request_log"("ts");

-- CreateIndex
CREATE INDEX "request_log_api_key_id_ts_idx" ON "request_log"("api_key_id", "ts");

-- CreateIndex
CREATE INDEX "request_log_model_id_ts_idx" ON "request_log"("model_id", "ts");

-- CreateIndex
CREATE INDEX "request_log_provider_id_ts_idx" ON "request_log"("provider_id", "ts");

-- CreateIndex
CREATE INDEX "usage_minute_api_key_id_minute_idx" ON "usage_minute"("api_key_id", "minute");

-- CreateIndex
CREATE INDEX "usage_minute_model_id_minute_idx" ON "usage_minute"("model_id", "minute");

-- CreateIndex
CREATE INDEX "aggregate_report_granularity_period_start_idx" ON "aggregate_report"("granularity", "period_start");

-- CreateIndex
CREATE INDEX "aggregate_report_granularity_provider_id_period_start_idx" ON "aggregate_report"("granularity", "provider_id", "period_start");

-- CreateIndex
CREATE INDEX "aggregate_report_granularity_model_id_period_start_idx" ON "aggregate_report"("granularity", "model_id", "period_start");

-- CreateIndex
CREATE INDEX "aggregate_report_granularity_api_key_id_period_start_idx" ON "aggregate_report"("granularity", "api_key_id", "period_start");

-- CreateIndex
CREATE INDEX "aggregate_report_granularity_provider_id_model_id_api_key_i_idx" ON "aggregate_report"("granularity", "provider_id", "model_id", "api_key_id", "latest");

-- CreateIndex
CREATE UNIQUE INDEX "aggregate_report_granularity_period_start_provider_id_model_key" ON "aggregate_report"("granularity", "period_start", "provider_id", "model_id", "api_key_id");

-- AddForeignKey
ALTER TABLE "ProviderModel" ADD CONSTRAINT "ProviderModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderModel" ADD CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

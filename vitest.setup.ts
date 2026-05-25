// Provide minimal env vars so lib/env.ts validation passes during tests.
process.env.DATABASE_URL ??= "file:./data/test.sqlite";
process.env.NEXTAUTH_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.ADMIN_INIT_USERNAME ??= "admin";
process.env.ADMIN_INIT_PASSWORD ??= "test-password";

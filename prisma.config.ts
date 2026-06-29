// prisma.config.ts
import { loadEnvConfig } from '@next/env'
import path from 'node:path'

import { defineConfig, env } from 'prisma/config'

loadEnvConfig(process.cwd())

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
})

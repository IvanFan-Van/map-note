/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  SECRET_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** 高德 Web 服务 Key (服务端地理编码) */
  AMAP_WEB_KEY: string;
}

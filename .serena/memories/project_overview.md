# Zoom Memo Automation Project Overview

## Purpose
Zoom録画ファイルを自動で文字起こし・要約し、Google Driveに保存してSlackに通知するシステム

## Tech Stack
- **Runtime**: Node.js (>=18.0.0)
- **Deployment**: Vercel (Hobbyプラン)
- **AI Services**: Google Gemini AI (gemini-2.5-pro)
- **Storage**: Google Drive API
- **Communication**: Slack API, Zoom API
- **Framework**: Express.js

## Key Dependencies
- axios: HTTP client
- @google/generative-ai: Gemini AI integration
- @slack/web-api: Slack API client
- googleapis: Google Drive API
- winston: Logging framework
- multer: File upload handling
- node-cron: Scheduled tasks

## Main Architecture
- **api/**: Vercel serverless functions (production endpoints)
- **1.src/**: Core application code
  - services/: Business logic (AI, Zoom, Slack, Drive services)
  - utils/: Utility functions (logging, error handling)
  - config/: Configuration files
- **3.operations/**: Operational tools and monitoring
- **2.tests/**: Test files

## Current Status
- Production system deployed on Vercel
- 2-stage audio processing (transcription → summary)
- Audio chunking for large files (>20MB, >20 minutes)
- Integration with Google Drive, Slack, and Zoom APIs
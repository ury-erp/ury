# URY Architecture Overview

This document provides a high-level overview of the URY app architecture.

## Tech Stack
- **Backend**: Frappe Framework (Python, MariaDB, Redis)
- **Frontend POS v2**: React 19, Vite, Zustand, TailwindCSS
- **Frontend KDS**: Vue 3, Vite, Socket.io
- **Legacy POS**: Vue 3, Pinia

## Core Concepts
- The system is built as a custom app on top of ERPNext.
- It extensively uses standard ERPNext Doctypes for accounting and inventory, while defining custom Doctypes (`ury_*`) for restaurant-specific workflows.
- Real-time communication for KDS and printing is handled via Socket.io.

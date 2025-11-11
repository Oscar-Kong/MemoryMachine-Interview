# How to Start the Servers

## Step 1: Setup (One-time, if not done yet)

### Backend Setup
Run these commands in your terminal:

```bash
cd "/Users/ok/Memory Machine Project/sentiment-aura/backend"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend Setup
In a new terminal:

```bash
cd "/Users/ok/Memory Machine Project/sentiment-aura/frontend"
npm install
```

---

## Step 2: Start the Servers

### Terminal 1 - Backend Server
```bash
cd "/Users/ok/Memory Machine Project/sentiment-aura/backend"
source venv/bin/activate
python main.py
```

Keep this terminal open. You should see: `Uvicorn running on http://0.0.0.0:8000`

### Terminal 2 - Frontend Server
```bash
cd "/Users/ok/Memory Machine Project/sentiment-aura/frontend"
npm start
```

This will open your browser automatically at `http://localhost:3000`

---

## Quick Reference

**Backend start command:**
```bash
cd backend && source venv/bin/activate && python main.py
```

**Frontend start command:**
```bash
cd frontend && npm start
```

---

## Windows Users

If you're on Windows, use these instead:

**Backend:**
```bash
cd backend
venv\Scripts\activate
python main.py
```

**Frontend:**
```bash
cd frontend
npm start
```


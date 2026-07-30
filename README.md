# myroom.in — Full Stack Setup Guide

## Project Structure

```
myroom-api/                    ← Your backend (Node.js)
├── server.js                  ← Entry point → run this
├── api.js                     ← Frontend API client (copy next to HTML)
├── myroom-deoghar.html        ← Your frontend (already wired up)
├── .env.example               ← Copy to .env and fill in values
├── src/
│   ├── app.js                 ← Express app setup
│   ├── config/
│   │   ├── db.js              ← MongoDB connection
│   │   └── email.js           ← Nodemailer + email templates
│   ├── models/
│   │   ├── User.js            ← Users (customer / host / admin)
│   │   ├── Room.js            ← Room listings
│   │   ├── Booking.js         ← Bookings with date-overlap check
│   │   └── Review.js          ← Reviews + auto rating update
│   ├── controllers/           ← Business logic
│   ├── routes/                ← API route definitions
│   ├── middleware/
│   │   ├── auth.js            ← JWT protect middleware
│   │   ├── rbac.js            ← Role-based access control
│   │   ├── errorHandler.js    ← Centralized error handler
│   │   ├── rateLimiter.js     ← Brute-force protection
│   │   └── upload.js          ← Multer image uploads
│   ├── services/
│   │   └── paymentService.js  ← Razorpay / Stripe abstraction
│   └── utils/
│       ├── generateToken.js   ← JWT access + refresh tokens
│       ├── geoDistance.js     ← Haversine distance calculator
│       └── apiFeatures.js     ← Query filter / sort / paginate
└── uploads/                   ← Room images stored here
```

---

## Step 1 — Install Dependencies

```bash
cd myroom-api
npm install
```

---

## Step 2 — Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/myroom_db   # or your Atlas URI
JWT_SECRET=any_long_random_string_here
JWT_REFRESH_SECRET=another_long_random_string
PAYMENT_GATEWAY=razorpay                        # or stripe
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
EMAIL_SMTP_USER=your@gmail.com
EMAIL_SMTP_PASS=your_gmail_app_password
FRONTEND_URL=http://localhost:3000
```

**MongoDB options:**
- Local: Install from https://www.mongodb.com/try/download/community
- Cloud: Free cluster at https://cloud.mongodb.com (paste the connection string as MONGO_URI)

---

## Step 3 — Start the Backend

```bash
# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

You should see:
```
──────────────────────────────────────────
🚀  myroom.in API  →  http://localhost:5000
🌍  Environment   →  development
💳  Payment GW    →  razorpay
──────────────────────────────────────────
📦  MongoDB connected → localhost
```

Test it's working:
```
GET http://localhost:5000/api/v1/health
```

---

## Step 4 — Connect the Frontend

Place these two files in the **same folder** on your computer:

```
your-project/
├── myroom-deoghar.html   ← frontend
└── api.js                ← API client (included via <script src="./api.js">)
```

The HTML already has this line at the bottom:
```html
<script src="./api.js"></script>
```

The `api.js` file points to `http://localhost:5000/api/v1` by default.
Change the first line of `api.js` for production:

```js
const API_BASE = 'https://your-deployed-api.com/api/v1';
```

Open the HTML in a browser — **use a local server**, not `file://`:

```bash
# Option A: Python (no install needed)
python3 -m http.server 3000
# then open http://localhost:3000/myroom-deoghar.html

# Option B: Node (install once globally)
npx serve .
# then open the URL it shows you

# Option C: VS Code → install "Live Server" extension → click "Go Live"
```

---

## Step 5 — Seed Test Data (Optional)

Add rooms manually via the API or create a seed script.

Quick test via curl:
```bash
# Register a host
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Host","email":"host@test.com","password":"test123","role":"host"}'

# Register a customer
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"user@test.com","password":"test123","role":"customer"}'
```

---

## API Endpoints Quick Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | — | Register (customer or host) |
| POST | `/api/v1/auth/login` | — | Login |
| POST | `/api/v1/auth/refresh-token` | Cookie | Refresh access token |
| POST | `/api/v1/auth/logout` | ✓ | Logout |
| GET | `/api/v1/auth/me` | ✓ | Get own profile |
| GET | `/api/v1/users/dashboard` | ✓ | Role-based dashboard |
| GET | `/api/v1/rooms` | — | List/search/filter rooms |
| GET | `/api/v1/rooms/:id` | — | Single room |
| GET | `/api/v1/rooms/:id/availability` | — | Booked date ranges |
| POST | `/api/v1/rooms` | host | Create listing |
| PUT | `/api/v1/rooms/:id` | host | Update listing |
| DELETE | `/api/v1/rooms/:id` | host | Delete listing |
| POST | `/api/v1/bookings` | customer | Create booking |
| GET | `/api/v1/bookings/my-bookings` | ✓ | My bookings |
| PATCH | `/api/v1/bookings/:id/cancel` | ✓ | Cancel booking |
| POST | `/api/v1/payments/create-checkout-session` | ✓ | Init payment |
| POST | `/api/v1/payments/verify` | ✓ | Verify Razorpay payment |
| POST | `/api/v1/payments/webhook` | — | Gateway webhook |
| POST | `/api/v1/support/contact` | — | Contact form |
| POST | `/api/v1/support/feedback` | ✓ | Platform feedback |
| POST | `/api/v1/support/reviews` | ✓ | Room review |
| GET | `/api/v1/support/reviews/:roomId` | — | Room reviews |

---

## Room Filter Query Parameters

```
GET /api/v1/rooms?city=Deoghar&landmark=Tower+Chowk&roomType=Couple&minPrice=500&maxPrice=3000&guests=2&sort=price-asc&page=1&limit=9
```

---

## Payment Flow (Razorpay)

```
1. User clicks "Book Now"         → POST /bookings     → booking created (pending)
2. User clicks "Pay"              → POST /payments/create-checkout-session → orderId returned
3. Razorpay popup opens           → User pays
4. On success callback            → POST /payments/verify → booking confirmed
5. Razorpay also calls webhook    → POST /payments/webhook → backup confirmation
```

---

## Deploying to Production

**Backend (Railway / Render / Heroku):**
1. Push code to GitHub
2. Connect repo to Railway/Render
3. Set all env variables in their dashboard
4. Update `FRONTEND_URL` to your HTML's hosted URL

**Frontend (GitHub Pages / Netlify / Vercel):**
1. Upload `myroom-deoghar.html` and `api.js`
2. Change `API_BASE` in `api.js` to your deployed backend URL
3. Make sure CORS allows your frontend domain (update `FRONTEND_URL` env var on backend)

---

## Common Issues

| Problem | Fix |
|---------|-----|
| "Failed to fetch" / CORS error | Make sure backend is running on port 5000 and FRONTEND_URL is set correctly in .env |
| MongoDB connection failed | Start MongoDB locally (`mongod`) or check your Atlas URI |
| Rooms not showing | Backend must be running AND have rooms in the database |
| 401 Unauthorized | Access token expired — `api.js` auto-refreshes, but if it fails, log in again |
| Razorpay not loading | Check RAZORPAY_KEY_ID in .env matches your dashboard |
| Email not sending | Use Gmail App Password (not your regular Gmail password) |

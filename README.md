# Tonz Cabin booking site

- `index.html` – the customer booking page (calendar, green/red slots, name entry). Has a small **Barber login** button top right.
- `admin.html` – your private barber page: upcoming bookings report, print/PDF, CSV download, cancel a booking, change PIN
- `netlify/functions/bookings.mjs` – saves bookings and the admin PIN so everything is shared (uses Netlify Blobs, no database to set up)

## Deploy to Netlify (recommended: via GitHub)

1. Create a free GitHub account and a new repository, then upload all the files in this folder (including the `netlify` folder).
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repository, and click Deploy. No build settings needed.
3. Open `your-site-address/admin.html` straight away and **set your PIN** on that first screen. Do this before sharing the link with anyone else, because the first person to open it sets the PIN.
4. Share the site address with your business partner.

### Alternative: Netlify CLI
```
npm install -g netlify-cli
cd tonz-cabin-booking
netlify deploy --prod
```

Note: dragging the folder onto Netlify's drag-and-drop box may publish the page but not install the function's dependency, so bookings would fall back to demo mode. Use GitHub or the CLI.

## Barber page and PIN
- Report: choose Next 7 / 14 / 30 days or all upcoming, then **Print / save as PDF** or **Download CSV** (opens in Excel or Google Sheets).
- Change your PIN any time from **Change PIN** at the bottom of the barber page (you need the current one).
- Five wrong PINs from one device locks it out for 15 minutes.
- Forgot the PIN? In Netlify go to **Site configuration → Environment variables**, add `ADMIN_PIN` with a new PIN and redeploy. That PIN then takes over. Delete the variable again later if you want to manage the PIN from the barber page instead.

## Testing
Until the site is live on Netlify, opening `index.html` directly shows a yellow "Demo mode" banner and bookings are only saved in that browser. The barber page only works on the live site.

## Changing hours
Current hours: mornings 9:00 to 12:00 in 15-minute slots (Tue to Fri), afternoons 12:00 to 5:00pm in 20-minute slots (Tue to Thu only). Fridays are mornings only.

Edit the slot loops in `index.html` (`buildSlots`) and in `netlify/functions/bookings.mjs` (`validSlots`), and `OPEN_DOW` in both files (2=Tue … 5=Fri). The Friday mornings-only rule is in both files too.

## Add to calendar (works straight away, free)
After booking, the customer sees **Add to Google Calendar** and **Add to Apple / Outlook calendar** buttons. The event has the haircut time, the address, and a 1-hour-before alert from their own calendar app.

## Text message reminders (optional, needs an SMS account)
The "Text me a reminder" tick box only appears on the booking page once SMS is set up. Until then customers just see the calendar buttons.

1. Create an account at twilio.com and get a Twilio phone number (or ask Twilio which sender works for New Zealand). Add credit. Trial accounts normally only text numbers you've verified, so top up before testing with real customers. Each text costs a small amount.
2. In Netlify: **Site configuration → Environment variables**, add these three:
   - `TWILIO_ACCOUNT_SID` – from the Twilio dashboard (starts with AC)
   - `TWILIO_AUTH_TOKEN` – from the Twilio dashboard
   - `TWILIO_FROM` – your Twilio number in international format, e.g. `+6421...` (a Messaging Service ID starting with MG also works)
3. **Deploys → Trigger deploy** so the variables take effect.
4. Test by booking a slot for later today with the tick box on. The text goes out about 2 hours before the appointment.

How it works: `netlify/functions/send-reminders.mjs` runs every 15 minutes on the live (published) site, finds bookings that asked for a reminder and are less than 2 hours away, and texts each one once. To change "2 hours", edit `REMIND_MINUTES_BEFORE` there and the wording in `index.html`. Your barber page shows "text reminder queued / sent" next to each booking. Only a New Zealand mobile number (021, 022, 027 and so on) can be texted.

## Booking window
Clients can book from today up to the same weekday one week later (on a Tuesday: through to next Tuesday; on Wednesday, next Wednesday opens). Change `DAYS_AHEAD` in both `index.html` and `netlify/functions/bookings.mjs` to alter this.

## Address and map
The address and map are in `index.html`. To change the location, replace `197+Dixon+Street,+Masterton,+New+Zealand` in the map link and iframe, and the visible address text.

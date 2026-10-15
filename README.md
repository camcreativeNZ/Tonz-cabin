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
Edit the slot loops in `index.html` (`buildSlots`) and in `netlify/functions/bookings.mjs` (`validSlots`), and `OPEN_DOW` in both files (2=Tue … 5=Fri). Friday mornings-only rules are in both files too.

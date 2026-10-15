# Tonz Cabin booking site

- `index.html` – the customer booking page (calendar, green/red slots, name entry)
- `admin.html` – your private view of who has booked, with a Cancel button (needs a PIN)
- `netlify/functions/bookings.mjs` – saves bookings so every visitor sees the same red/green slots (uses Netlify Blobs, no database to set up)

## Deploy to Netlify (recommended: via GitHub)

1. Create a free GitHub account and a new repository, then upload all the files in this folder.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repository, and click Deploy. No build settings needed.
3. In Netlify: **Site configuration → Environment variables → Add variable**
   - Key: `ADMIN_PIN`  Value: a PIN of your choice
   then **Deploys → Trigger deploy** so it takes effect.
4. Share the site URL with your business partner. Your barber view is at `/admin.html`.

### Alternative: Netlify CLI
```
npm install -g netlify-cli
cd tonz-cabin-booking
netlify deploy --prod
```

Note: dragging the folder onto Netlify's drag-and-drop box may publish the page but not install the function's dependency, so bookings would fall back to demo mode. Use GitHub or the CLI.

## Testing
Until the site is live on Netlify, opening `index.html` directly shows a yellow "Demo mode" banner and bookings are only saved in that browser. Once deployed, the banner disappears and bookings are shared.

## Changing hours
Edit the slot loops in `index.html` (`buildSlots`) and in `netlify/functions/bookings.mjs` (`validSlots`), and `OPEN_DOW` in both files (2=Tue … 5=Fri).

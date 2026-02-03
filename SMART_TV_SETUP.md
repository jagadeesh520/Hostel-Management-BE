# Smart TV Display System - Setup & Usage Guide

## Overview

The Smart TV Display System transforms your hostel's Smart TVs into dynamic digital notice boards that display:
- 📅 Class Timetables
- 🍽️ Mess Food Menus (Breakfast, Lunch, Dinner)
- 🍲 Food Gallery Images
- 🎬 Motivational Videos (1-minute podcasts)

## Features

✅ **Admin Content Management** - Upload and manage all content from mobile app
✅ **Auto-Rotation** - Content cycles automatically with smooth transitions
✅ **Scheduling** - Schedule content for specific date/time ranges
✅ **Analytics** - Track views, display time, and TV uptime
✅ **Cloud Storage** - Cloudinary CDN for fast, optimized media delivery
✅ **Multi-Platform** - Web-based (primary) + React Native (secondary)
✅ **Preview Mode** - Preview exactly what TVs will display before publishing

## Architecture

```
Admin Mobile App (React Native)
    ↓ Upload Content
Backend API (Express + MongoDB)
    ↓ Store Media
Cloudinary CDN
    ↓ Serve Optimized Media
Smart TV Browser (Web Display)
    ↓ Track Analytics
Analytics Dashboard (Admin)
```

## Setup Instructions

### 1. Cloudinary Account Setup

1. Create free account at [cloudinary.com](https://cloudinary.com)
2. Get your credentials from Dashboard:
   - Cloud Name
   - API Key
   - API Secret

3. Add to `.env` file:
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 2. Backend Setup

Packages are already installed. Just ensure `.env` has Cloudinary credentials.

**New Routes Added:**
- `/api/tv-content/*` - Content management
- `/api/tv-analytics/*` - Analytics tracking
- `/api/tv-display-config/*` - Display configuration
- `/api/menu/tv-display` - Enhanced menu endpoint
- `/tv-display` - Web TV display (static files)

### 3. Database

New collections will be created automatically:
- `tvcontents` - Content metadata
- `tvcontentanalytics` - View tracking
- `tvdisplayconfigs` - Display settings

### 4. Smart TV Configuration

#### Option A: Web Browser (Recommended)

1. Open TV's web browser
2. Navigate to: `http://[SERVER_IP]:5000/tv-display?hostelId=default`
3. Press F11 for fullscreen (or browser's fullscreen option)
4. Configure TV to:
   - Open browser on boot
   - Disable sleep mode
   - Set homepage to TV display URL

#### Option B: React Native App

1. Build Android TV APK
2. Install on Android TV device
3. Open app → Navigate to "TV Display" screen

### 5. Admin App Setup

New screens added to Admin Dashboard:
- **Smart TV Manager** - Upload and manage content
- **TV Analytics** - View statistics and insights

## Usage Guide

### For Admins

#### 1. Upload Content

1. Open Admin Dashboard
2. Tap "Smart TV Manager"
3. Select tab (Timetables / Food Images / Videos)
4. Fill in:
   - Title
   - Display Duration (seconds)
   - Select File
5. Tap "Upload Content"

**File Requirements:**
- Timetables: Images (JPG, PNG, WEBP) or PDF, max 10MB
- Food Images: Images (JPG, PNG, WEBP), max 10MB
- Videos: MP4/MOV/WEBM, max 100MB, recommended 1-minute duration

#### 2. Manage Content

- **Toggle Active/Inactive**: Tap eye icon
- **Schedule**: Tap calendar icon → Set date range
- **Delete**: Tap trash icon → Confirm
- **Reorder**: Content displays in order shown

#### 3. Schedule Content

1. Tap calendar icon on content card
2. Set Start Date/Time (or leave empty for "Always")
3. Set End Date/Time (or leave empty for "Always")
4. Tap "Save"

Content will only display during the scheduled period.

#### 4. View Analytics

1. Open "TV Analytics" from Admin Dashboard
2. View:
   - Total views and display time
   - Active TVs count (real-time)
   - Top performing content
   - Daily statistics chart
3. Filter by date range (7/30/90 days)
4. Pull down to refresh

#### 5. Preview Content

1. Open "TV Analytics" → Tap any content
2. Or use "TV Preview" screen to see full rotation

### For TV Display

**Auto-Rotation Flow:**
1. Timetable slides (15 seconds each by default)
2. Mess Menu (20 seconds - shows all 3 meals)
3. Food Images carousel (10 seconds per image)
4. Motivational videos (plays full duration)
5. Loop repeats infinitely

**Features:**
- ⏰ Live clock and date in header
- 📢 Scrolling announcements in footer
- 🌙 Dark theme optimized for TVs
- 🔄 Auto-refresh every 5 minutes
- 📡 Offline fallback

## Configuration

### Display Settings

Customize rotation timing and theme:

**API Endpoint:** `PUT /api/tv-display-config/:hostelId`

```json
{
  "rotationSettings": {
    "timetableEnabled": true,
    "timetableDuration": 15,
    "menuEnabled": true,
    "menuDuration": 20,
    "foodImagesEnabled": true,
    "foodImagesDuration": 10,
    "videosEnabled": true,
    "videoDuration": 60
  },
  "theme": {
    "backgroundColor": "#1a1a2e",
    "primaryColor": "#6200ee",
    "fontFamily": "Arial, sans-serif"
  }
}
```

### Multiple Locations

Support different content per hostel:

1. Create content with specific `hostelId`
2. Access TV display: `/tv-display?hostelId=HOSTEL_123`
3. Content tagged with that hostel (or global) will display

## API Endpoints

### Content Management (Admin Only)

- `POST /api/tv-content/upload` - Upload new content
- `GET /api/tv-content/admin` - List all content (with filters)
- `PUT /api/tv-content/:id/toggle` - Enable/disable content
- `PUT /api/tv-content/:id` - Update content metadata
- `DELETE /api/tv-content/:id` - Delete content

### TV Display (Public)

- `GET /api/tv-content/active` - Get active content for display
- `GET /api/tv-display-config/:hostelId` - Get display configuration

### Analytics (Admin Only)

- `POST /api/tv-analytics/track` - Track display event (called by TV)
- `GET /api/tv-analytics/dashboard` - Get analytics summary
- `GET /api/tv-analytics/content/:id` - Get content-specific stats
- `GET /api/tv-analytics/realtime` - Get real-time TV status

### Menu (Public)

- `GET /api/menu/tv-display?date=YYYY-MM-DD` - Get structured menu for TV

## Troubleshooting

### TV Not Loading Content

1. Check server is running: `http://[SERVER_IP]:5000/`
2. Verify TV can access server (same network)
3. Check browser console for errors (F12)
4. Verify Cloudinary credentials in `.env`

### Content Not Uploading

1. Check file size (max 100MB)
2. Check file format is supported
3. Verify Cloudinary credentials
4. Check server logs for errors

### Videos Not Playing

1. Check video format (MP4 recommended)
2. Verify video duration (1 minute optimal)
3. Check TV browser supports HTML5 video
4. Try different video codec (H.264)

### Analytics Not Tracking

1. Check TV has internet connection
2. Verify analytics endpoint is accessible
3. Check TV Display ID in localStorage (browser DevTools)
4. Review server logs for analytics POST requests

## Performance Optimization

### Cloudinary Optimizations

- Auto-format: Serves WebP to supported browsers
- Auto-quality: Balances quality vs size
- Lazy loading: Only loads visible content
- CDN delivery: Global edge servers for fast loading

### TV Display Optimizations

- Content cached for 5 minutes
- Analytics batched every 30 seconds
- Smooth CSS transitions (GPU-accelerated)
- Efficient DOM updates

### Database Indexing

Indexes created automatically:
- `tvcontents`: isActive, displayOrder, scheduledStart, scheduledEnd
- `tvcontentanalytics`: contentId+date+tvDisplayId, hostelId+date

## Best Practices

### Content Guidelines

**Timetables:**
- Use high-resolution images (1920x1080 recommended)
- Clear, readable fonts
- Good contrast for TV viewing

**Food Images:**
- Appetizing, well-lit photos
- Show actual mess food
- Update regularly to maintain interest

**Videos:**
- Keep under 1 minute for better rotation
- High quality but compressed
- Inspirational/educational content
- Add subtitles (audio may be muted)

### Scheduling Tips

- Schedule special announcements (events, holidays)
- Remove outdated content regularly
- Use scheduling for time-sensitive info
- Set "always show" for evergreen content

### TV Setup Tips

- Use wired ethernet (more stable than WiFi)
- Disable TV sleep/screensaver
- Set browser to kiosk mode if available
- Regular TV restarts (weekly) to clear cache

## Support

For issues or questions:
1. Check server logs: `Hostel-Management-BE/logs/`
2. Check browser console on TV (F12)
3. Review this guide's Troubleshooting section
4. Contact system administrator

## Future Enhancements

Potential additions:
- 🎨 Custom themes per hostel
- 📊 Advanced analytics (heatmaps, engagement)
- 🔔 Real-time announcements/alerts
- 📱 QR codes for student interaction
- 🌐 Multi-language support
- 📺 Remote TV management dashboard
- 🎯 Content A/B testing

---

**Version:** 1.0.0  
**Last Updated:** December 30, 2025


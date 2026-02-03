# Smart TV Notifications Feature

## Overview

The Notifications feature allows admins to broadcast important announcements directly to all Smart TV displays. Perfect for gate notifications, exam schedules, events, and urgent alerts.

## ✨ Features

### Notification Types
- 🚪 **Gate Notifications** - Access control, visitor info
- 📝 **Exam Notifications** - External exams, schedules, instructions
- 🎉 **Event Notifications** - College events, celebrations
- 📢 **Announcements** - General information
- 🚨 **Alert Notifications** - Urgent messages

### Priority Levels
- **Low** - General information (green)
- **Medium** - Standard notices (orange)
- **High** - Important announcements (red)
- **Urgent** - Critical alerts with pulsing animation (bright red)

### Display Options
- **Text-only** - No image required
- **Text + Image** - Visual notification with supporting image
- **Scheduling** - Display at specific times
- **Auto-rotation** - Appears first in rotation cycle

## 📱 How to Use (Admin)

### Creating a Notification

1. Open Admin Dashboard → **Smart TV Manager**
2. Tap **Notifications** tab (first tab with bell icon 🔔)
3. Fill in the form:
   - **Title**: Main message (e.g., "Gate Pass Required")
   - **Notification Type**: Select from dropdown
     - Gate, Exam, Event, Announcement, Alert
   - **Priority**: Select urgency level
     - Low, Medium, High, Urgent
   - **Description**: Additional details (optional)
   - **Display Duration**: How long to show (seconds)
   - **Image**: Optional supporting image

4. Tap **Upload Content**

### Notification Type Examples

**Gate Notification:**
```
Title: "Gate Pass Required - December 31st"
Type: Gate
Priority: High
Description: "All students must carry valid gate passes. External exams scheduled."
```

**Exam Notification:**
```
Title: "GATE 2025 - Registration Closes Tomorrow"
Type: Exam
Priority: Urgent
Description: "Last date to register for GATE exam is Dec 31st. Visit official website."
```

**Event Notification:**
```
Title: "Annual Day Celebration - Jan 5th"
Type: Event
Priority: Medium
Description: "Join us for the Annual Day celebration. Venue: Main Auditorium, 10 AM"
```

**Alert Notification:**
```
Title: "Power Cut - 2 PM to 4 PM Today"
Type: Alert
Priority: Urgent
Description: "Scheduled maintenance. Please plan accordingly."
```

## 📺 TV Display Behavior

### Display Style
- **Large animated bell icon** (🔔) with ringing animation
- **Colored type badge** indicating notification category
- **Bold title** (56px font) with shadow
- **Description text** (32px font) below title
- **Optional image** on the right side
- **Gradient background** matching priority level

### Priority Visual Effects

**Urgent Priority:**
- Pulsing red border animation
- Red gradient background
- Larger shadow for emphasis
- Bell icon rings continuously

**High Priority:**
- Orange/red border
- Standard animations

**Medium/Low Priority:**
- Blue/green styling
- Subtle animations

### Rotation Behavior
- Notifications always appear **first** in rotation
- Multiple notifications rotate before other content
- Duration: Configured per notification (default 15 seconds)
- Then cycles to timetables → menus → food images → videos

## 🔧 Technical Details

### Database Schema
```javascript
TVContent {
  contentType: "notification"
  title: String (required)
  mediaUrl: String (optional - can be null for text-only)
  notificationType: "gate" | "exam" | "event" | "announcement" | "alert"
  priority: "low" | "medium" | "high" | "urgent"
  description: String (optional)
  displayDuration: Number (seconds)
  isActive: Boolean
  scheduledStart: Date (optional)
  scheduledEnd: Date (optional)
}
```

### API Endpoints
All standard TV content endpoints support notifications:
- `POST /api/tv-content/upload` - Upload notification
- `GET /api/tv-content/active` - Includes notifications
- `PUT /api/tv-content/:id/toggle` - Enable/disable
- `DELETE /api/tv-content/:id` - Remove notification

### File Upload
- **Optional** - Notifications can be text-only
- **Supported formats**: JPG, PNG, WEBP
- **Max size**: 10MB
- **Recommended size**: 500x400px for side display

## 🎨 Visual Examples

### Text-Only Notification
```
┌─────────────────────────────────────┐
│  🔔                                 │
│  [GATE NOTIFICATION]                │
│  Gate Pass Required Today           │
│  All students must show valid ID    │
└─────────────────────────────────────┘
```

### Notification with Image
```
┌─────────────────────────────────────┐
│  🚨        [URGENT ALERT]      ┌───┐│
│  Hostel Mess Closed Today      │IMG││
│  Due to maintenance            │   ││
│  Alternative arrangements made └───┘│
└─────────────────────────────────────┘
```

## 📋 Best Practices

### Writing Effective Notifications

**Do:**
- Keep titles short and clear (max 60 characters)
- Use action words ("Register Now", "Bring ID", "Attend Meeting")
- Include dates and times when relevant
- Use appropriate priority levels
- Add images for better visibility

**Don't:**
- Write long paragraphs (use description sparingly)
- Use all caps (except for urgent alerts)
- Mix multiple messages in one notification
- Forget to remove outdated notifications

### Scheduling Recommendations

**Gate Notifications:**
- Schedule 1 day before the event
- Set high priority
- Include date/time in title

**Exam Notifications:**
- Schedule 1 week before deadline
- Urgent priority for last-day reminders
- Update regularly with countdown

**Event Notifications:**
- Schedule 3 days before event
- Medium priority
- Include venue and time

### Content Management

1. **Review regularly** - Remove expired notifications
2. **Update schedules** - Use scheduling for time-sensitive info
3. **Test first** - Preview before publishing important alerts
4. **Limit active** - Keep 3-5 active notifications max for clarity
5. **Use images** - Visual notifications get more attention

## 🚀 Quick Start Examples

### Example 1: Gate Closure Notification
```javascript
Title: "Main Gate Closed - Use Side Entrance"
Type: Alert
Priority: High
Description: "Main gate under repair. Use side entrance near Block B."
Display Duration: 20 seconds
Image: Photo of side entrance (optional)
```

### Example 2: Exam Registration
```javascript
Title: "CAT 2025 - Register by December 31st"
Type: Exam
Priority: Urgent
Description: "Last day for Common Admission Test registration. Visit www.iimcat.ac.in"
Display Duration: 25 seconds
Image: CAT logo/poster
```

### Example 3: Special Event
```javascript
Title: "Republic Day Celebration - January 26th"
Type: Event
Priority: Medium
Description: "Flag hoisting at 8 AM. All students invited. Main campus ground."
Display Duration: 15 seconds
Image: Event banner
Schedule: Jan 20 - Jan 26
```

## 📊 Analytics

Notifications are tracked like all other content:
- View count per notification
- Display time
- Active TVs reached
- Daily breakdown

View in **TV Analytics** dashboard.

## 🔄 Integration with Existing Features

Notifications work seamlessly with:
- **Timetables** - Rotate between notifications and timetables
- **Menus** - Appear before daily menu display
- **Food Images** - Integrated in rotation cycle
- **Videos** - Separate section in rotation

## 💡 Tips & Tricks

1. **Urgent Alerts**: Use sparingly to maintain impact
2. **Color Coding**: Students learn to recognize types by color
3. **Consistent Format**: Use similar phrasing for same type
4. **Visual Aids**: Images increase attention by 60%
5. **Timing**: Schedule notifications for peak viewing hours

## 🐛 Troubleshooting

**Notification not showing:**
1. Check if isActive is true
2. Verify schedule dates
3. Ensure backend is running
4. Check TV is online in analytics

**Image not displaying:**
1. Verify file size (max 10MB)
2. Check Cloudinary upload succeeded
3. Try text-only notification first

**Wrong priority display:**
1. Refresh TV display
2. Check priority field in database
3. Clear browser cache on TV

---

**Feature Version:** 1.0.0  
**Added:** December 30, 2025  
**Status:** Production Ready ✅


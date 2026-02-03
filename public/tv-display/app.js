// Smart TV Display Application
(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        API_BASE_URL: window.location.origin,
        REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
        ANALYTICS_BATCH_INTERVAL: 30 * 1000, // 30 seconds
    };

    // State
    const state = {
        hostelId: null,
        tvDisplayId: null,
        config: null,
        content: [],
        currentIndex: 0,
        rotationQueue: [],
        analyticsQueue: [],
        isPlaying: false,
        videoTimeout: null, // Timeout for video fallback
    };

    // DOM Elements
    const elements = {
        loadingScreen: document.getElementById('loading-screen'),
        errorScreen: document.getElementById('error-screen'),
        errorMessage: document.getElementById('error-message'),
        mainDisplay: document.getElementById('main-display'),
        clock: document.getElementById('clock'),
        date: document.getElementById('date'),
        notificationSection: document.getElementById('notification-section'),
        timetableSection: document.getElementById('timetable-section'),
        foodImagesSection: document.getElementById('food-images-section'),
        videoSection: document.getElementById('video-section'),
        timetableImage: document.getElementById('timetable-image'),
        timetableTitle: document.getElementById('timetable-title'),
        foodCarousel: document.getElementById('food-carousel'),
        foodImagesTitle: document.getElementById('food-images-title'),
        videoPlayer: document.getElementById('video-player'),
        videoTitle: document.getElementById('video-title'),
        announcements: document.getElementById('announcements'),
    };

    // Initialize
    async function init() {
        console.log('Initializing Smart TV Display...');

        // Get hostelId from URL
        const urlParams = new URLSearchParams(window.location.search);
        state.hostelId = urlParams.get('hostelId') || 'default';

        // Generate unique TV display ID (use localStorage to persist)
        state.tvDisplayId = localStorage.getItem('tvDisplayId');
        if (!state.tvDisplayId) {
            state.tvDisplayId = `TV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('tvDisplayId', state.tvDisplayId);
        }

        console.log('TV Display ID:', state.tvDisplayId);
        console.log('Hostel ID:', state.hostelId);

        // Start clock
        updateClock();
        setInterval(updateClock, 1000);

        // Load initial data
        await loadData();

        // Start rotation
        startRotation();

        // Set up refresh interval
        setInterval(loadData, CONFIG.REFRESH_INTERVAL);

        // Set up analytics batching
        setInterval(sendAnalyticsBatch, CONFIG.ANALYTICS_BATCH_INTERVAL);

        // Request fullscreen
        requestFullscreen();
    }

    // Load configuration and content
    async function loadData() {
        try {
            console.log('Loading data...');

            // Fetch configuration
            const configResponse = await fetch(`${CONFIG.API_BASE_URL}/api/tv-display-config/${state.hostelId}`);
            const configData = await configResponse.json();
            state.config = configData.config;

            // Fetch active content
            const contentResponse = await fetch(`${CONFIG.API_BASE_URL}/api/tv-content/active?hostelId=${state.hostelId}`);
            const contentData = await contentResponse.json();
            state.content = contentData.content || [];

            // Build rotation queue (no menu)
            buildRotationQueue();

            // Hide loading, show main display
            elements.loadingScreen.style.display = 'none';
            elements.errorScreen.style.display = 'none';
            elements.mainDisplay.style.display = 'flex';

            console.log('Data loaded successfully');
        } catch (error) {
            console.error('Error loading data:', error);
            showError('Unable to load content. Retrying in 30 seconds...');
            setTimeout(loadData, 30000);
        }
    }

    // Build rotation queue based on config
    function buildRotationQueue() {
        state.rotationQueue = [];

        // Group content by type
        const contentByType = {
            notification: state.content.filter(c => c.contentType === 'notification'),
            timetable: state.content.filter(c => c.contentType === 'timetable'),
            foodImage: state.content.filter(c => c.contentType === 'foodImage'),
            video: state.content.filter(c => c.contentType === 'video'),
        };

        // Add to queue based on config
        // Always show notifications first if they exist (high priority)
        if (contentByType.notification.length > 0) {
            contentByType.notification.forEach(item => {
                state.rotationQueue.push({
                    type: 'notification',
                    data: item,
                    duration: item.displayDuration || 15,
                });
            });
        }

        if (state.config.rotationSettings.timetableEnabled && contentByType.timetable.length > 0) {
            contentByType.timetable.forEach(item => {
                state.rotationQueue.push({
                    type: 'timetable',
                    data: item,
                    duration: item.displayDuration || state.config.rotationSettings.timetableDuration,
                });
            });
        }

        if (state.config.rotationSettings.foodImagesEnabled && contentByType.foodImage.length > 0) {
            state.rotationQueue.push({
                type: 'foodImage',
                data: contentByType.foodImage,
                duration: contentByType.foodImage.length * state.config.rotationSettings.foodImagesDuration,
            });
        }

        if (state.config.rotationSettings.videosEnabled && contentByType.video.length > 0) {
            contentByType.video.forEach(item => {
                // For videos, displayDuration of 0 means "play full video" (duration will be determined from video metadata)
                // Use a large fallback duration (1 hour) in case video metadata isn't available
                const duration = item.displayDuration === 0 ? 3600 : (item.displayDuration || state.config.rotationSettings.videoDuration);
                state.rotationQueue.push({
                    type: 'video',
                    data: item,
                    duration: duration,
                    playFullVideo: item.displayDuration === 0, // Flag to indicate full video playback
                });
            });
        }

        console.log('Rotation queue built:', state.rotationQueue.length, 'items');
    }

    // Start rotation
    function startRotation() {
        if (state.rotationQueue.length === 0) {
            console.warn('No content to display');
            showError('No content available to display');
            return;
        }

        state.isPlaying = true;
        displayNext();
    }

    // Display next item in rotation
    function displayNext() {
        if (!state.isPlaying || state.rotationQueue.length === 0) return;

        const currentItem = state.rotationQueue[state.currentIndex];
        console.log('Displaying:', currentItem.type, currentItem.duration + 's');

        // Hide all sections
        hideAllSections();

        // Display current section
        switch (currentItem.type) {
            case 'notification':
                displayNotification(currentItem.data);
                break;
            case 'timetable':
                displayTimetable(currentItem.data);
                break;
            case 'foodImage':
                displayFoodImages(currentItem.data);
                break;
            case 'video':
                displayVideo(currentItem.data);
                break;
        }

        // Track analytics
        trackDisplay(currentItem);

        // Schedule next (but for videos, the onended event will handle it)
        if (currentItem.type !== 'video') {
            setTimeout(() => {
                state.currentIndex = (state.currentIndex + 1) % state.rotationQueue.length;
                displayNext();
            }, currentItem.duration * 1000);
        }
        // For videos, the displayVideo function handles the transition via onended event
    }

    // Hide all content sections
    function hideAllSections() {
        // Remove active class from all sections
        elements.notificationSection.classList.remove('active');
        elements.timetableSection.classList.remove('active');
        elements.foodImagesSection.classList.remove('active');
        elements.videoSection.classList.remove('active');
        
        // Remove priority classes
        elements.notificationSection.classList.remove('priority-urgent', 'priority-high');
    }

    // Display notification
    function displayNotification(data) {
        // Set icon based on type
        const icons = {
            gate: '🚪',
            exam: '📝',
            event: '🎉',
            announcement: '📢',
            alert: '🚨'
        };
        
        const notificationIcon = document.getElementById('notification-icon');
        const notificationType = document.getElementById('notification-type');
        const notificationTitle = document.getElementById('notification-title');
        const notificationDescription = document.getElementById('notification-description');
        const notificationImageContainer = document.getElementById('notification-image-container');
        const notificationImage = document.getElementById('notification-image');
        
        notificationIcon.textContent = icons[data.notificationType] || '🔔';
        notificationType.textContent = (data.notificationType || 'ANNOUNCEMENT').toUpperCase();
        notificationType.className = `notification-type ${data.notificationType || 'announcement'}`;
        notificationTitle.textContent = data.title;
        notificationDescription.textContent = data.description || '';
        
        // Show image if available
        if (data.mediaUrl) {
            notificationImage.src = data.mediaUrl;
            notificationImageContainer.style.display = 'block';
        } else {
            notificationImageContainer.style.display = 'none';
        }
        
        // Apply priority styling
        if (data.priority === 'urgent') {
            elements.notificationSection.classList.add('priority-urgent');
        } else if (data.priority === 'high') {
            elements.notificationSection.classList.add('priority-high');
        }
        
        elements.notificationSection.classList.add('active');
    }

    // Display timetable
    function displayTimetable(data) {
        elements.timetableTitle.textContent = data.title || 'Timetable';
        elements.timetableImage.src = data.mediaUrl;
        elements.timetableSection.classList.add('active');
    }

    // Display food images
    function displayFoodImages(data) {
        // Show title for first item or a general title
        if (data.length > 0) {
            elements.foodImagesTitle.textContent = data[0].title || 'Food Images';
        } else {
            elements.foodImagesTitle.textContent = 'Food Images';
        }
        
        elements.foodCarousel.innerHTML = '';

        // Duplicate items for infinite scroll effect
        const items = [...data, ...data];

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'carousel-item';

            const img = document.createElement('img');
            img.src = item.mediaUrl;
            img.alt = item.title;

            div.appendChild(img);
            elements.foodCarousel.appendChild(div);
        });

        elements.foodImagesSection.classList.add('active');
    }

    // Display video
    function displayVideo(data) {
        elements.videoTitle.textContent = data.title || 'Video';
        elements.videoPlayer.src = data.mediaUrl;
        elements.videoPlayer.load();
        elements.videoSection.classList.add('active');
        
        // Clear any previous timeout
        if (state.videoTimeout) {
            clearTimeout(state.videoTimeout);
            state.videoTimeout = null;
        }
        
        // Clear previous onended handler
        elements.videoPlayer.onended = null;
        
        // Play video
        const playPromise = elements.videoPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Video started playing
                console.log('Video started playing');
            }).catch(error => {
                console.error('Error playing video:', error);
                // If video fails to play, advance after a short delay
                state.videoTimeout = setTimeout(() => {
                    state.currentIndex = (state.currentIndex + 1) % state.rotationQueue.length;
                    displayNext();
                }, 2000);
            });
        }

        // Auto-advance when video ends (primary method for full video playback)
        elements.videoPlayer.onended = () => {
            console.log('Video ended, advancing to next');
            if (state.videoTimeout) {
                clearTimeout(state.videoTimeout);
                state.videoTimeout = null;
            }
            state.currentIndex = (state.currentIndex + 1) % state.rotationQueue.length;
            displayNext();
        };
        
        // Fallback: If onended doesn't fire (shouldn't happen, but safety net)
        // Use video duration if available, otherwise use the queue item duration
        const currentItem = state.rotationQueue[state.currentIndex];
        const videoDuration = elements.videoPlayer.duration || currentItem.duration;
        const fallbackDuration = videoDuration > 0 ? (videoDuration * 1000) + 1000 : (currentItem.duration * 1000) + 5000; // Add buffer
        
        state.videoTimeout = setTimeout(() => {
            // Only use timeout if video hasn't ended naturally
            if (elements.videoPlayer.readyState >= 2) { // HAVE_CURRENT_DATA or higher
                console.warn('Video timeout fallback triggered');
                if (elements.videoPlayer.onended) {
                    elements.videoPlayer.onended = null; // Prevent double-trigger
                }
                state.currentIndex = (state.currentIndex + 1) % state.rotationQueue.length;
                displayNext();
            }
        }, fallbackDuration);
    }

    // Track display for analytics
    function trackDisplay(item) {
        if (item.type === 'menu') return; // Don't track menu separately

        const analyticsData = {
            contentId: item.data._id,
            tvDisplayId: state.tvDisplayId,
            hostelId: state.hostelId,
            displayTime: item.duration,
        };

        state.analyticsQueue.push(analyticsData);
    }

    // Send analytics batch
    async function sendAnalyticsBatch() {
        if (state.analyticsQueue.length === 0) return;

        try {
            const batch = [...state.analyticsQueue];
            state.analyticsQueue = [];

            for (const item of batch) {
                await fetch(`${CONFIG.API_BASE_URL}/api/tv-analytics/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item),
                });
            }

            console.log('Analytics batch sent:', batch.length, 'items');
        } catch (error) {
            console.error('Error sending analytics:', error);
            // Add back to queue
            state.analyticsQueue.push(...batch);
        }
    }

    // Update clock and date
    function updateClock() {
        const now = new Date();

        // Time
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        elements.clock.textContent = `${hours}:${minutes}:${seconds}`;

        // Date
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        elements.date.textContent = now.toLocaleDateString('en-US', options);
    }

    // Show error
    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.loadingScreen.style.display = 'none';
        elements.mainDisplay.style.display = 'none';
        elements.errorScreen.style.display = 'flex';
    }

    // Request fullscreen
    function requestFullscreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }

    // Start application when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


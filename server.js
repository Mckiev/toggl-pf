require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const moment = require('moment-timezone');
const app = express();
const PORT = process.env.PORT || 3000;
const TOGGL_API_TOKEN = process.env.TOGGL_API_TOKEN;
const TIMEZONE = 'America/Los_Angeles';

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API route to fetch Toggl data
app.get('/api/toggl', async (req, res) => {
    try {
        // Validate API token
        if (!TOGGL_API_TOKEN) {
            return res.status(500).json({ error: 'API token not configured' });
        }

        // Get date ranges with proper timezone handling
        const now = moment().tz(TIMEZONE);
        const today = now.format('YYYY-MM-DD');
        const startDate = '2024-12-02'; // API limitation
        
        // Use UTC format for today's data
        const nowUTC = moment.utc();
        const todayUTC = nowUTC.format('YYYY-MM-DD');
        const todayStart = `${todayUTC}T00:00:00Z`;
        const todayEnd = `${todayUTC}T23:59:59Z`;
        
        // Fetch today's data
        let todayEntries = [];
        try {
            const todayResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries', {
                params: {
                    start_date: todayStart,
                    end_date: todayEnd
                },
                auth: { username: TOGGL_API_TOKEN, password: 'api_token' },
                headers: { 'Content-Type': 'application/json' }
            });
            
            todayEntries = todayResponse.data;
        } catch (error) {
            console.error('Error fetching today\'s data:', error.message);
        }
        
        // If no today entries, try alternative approaches
        if (todayEntries.length === 0) {
            try {
                // Try getting current running entry
                const currentResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries/current', {
                    auth: { username: TOGGL_API_TOKEN, password: 'api_token' },
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (currentResponse.data && Object.keys(currentResponse.data).length > 0) {
                    todayEntries.push(currentResponse.data);
                }
            } catch (error) {
                // Silently continue if this fails
            }
            
            // Try getting recent entries and filter for today
            try {
                const recentResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries', {
                    auth: { username: TOGGL_API_TOKEN, password: 'api_token' },
                    headers: { 'Content-Type': 'application/json' }
                });
                
                // Filter for today's entries in local timezone
                const additionalTodayEntries = recentResponse.data.filter(entry => {
                    if (!entry.start) return false;
                    const entryDate = moment(entry.start).tz(TIMEZONE).format('YYYY-MM-DD');
                    return entryDate === today;
                });
                
                // Add new entries (avoid duplicates)
                if (additionalTodayEntries.length > 0) {
                    const existingIds = new Set(todayEntries.map(e => e.id));
                    const newEntries = additionalTodayEntries.filter(e => !existingIds.has(e.id));
                    todayEntries = [...todayEntries, ...newEntries];
                }
            } catch (error) {
                console.error('Error fetching recent entries:', error.message);
            }
        }

        // For historical data, use monthly chunks
        let allHistoricalEntries = [];
        try {
            const startMoment = moment(startDate);
            const endMoment = moment(today).subtract(1, 'day'); // Exclude today
            let currentStart = startMoment.clone();
            
            while (currentStart.isBefore(endMoment)) {
                const chunkEnd = currentStart.clone().add(1, 'month');
                const adjustedEnd = moment.min(chunkEnd, endMoment);
                
                const chunkStartStr = currentStart.format('YYYY-MM-DD') + 'T00:00:00Z';
                const chunkEndStr = adjustedEnd.format('YYYY-MM-DD') + 'T23:59:59Z';
                
                try {
                    const chunkResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries', {
                        params: {
                            start_date: chunkStartStr,
                            end_date: chunkEndStr
                        },
                        auth: { username: TOGGL_API_TOKEN, password: 'api_token' },
                        headers: { 'Content-Type': 'application/json' }
                    });
                    
                    allHistoricalEntries = [...allHistoricalEntries, ...chunkResponse.data];
                } catch (error) {
                    console.error(`Error fetching data for ${currentStart.format('YYYY-MM')}:`, error.message);
                }
                
                // Move to next chunk
                currentStart = chunkEnd;
            }
        } catch (error) {
            console.error('Error fetching historical data:', error.message);
        }

        // Format entries with proper timezone conversion
        const formatEntries = (entries) => {
            return entries.map(entry => ({
                ...entry,
                start: entry.start ? moment(entry.start).tz(TIMEZONE).format() : null,
                stop: entry.stop ? moment(entry.stop).tz(TIMEZONE).format() : null
            }));
        };

        res.json({
            today: formatEntries(todayEntries),
            historical: formatEntries(allHistoricalEntries)
        });
    } catch (error) {
        console.error('Error in /api/toggl endpoint:', error.message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
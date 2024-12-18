require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 3000;
const TOGGL_API_TOKEN = process.env.TOGGL_API_TOKEN;
const TIMEZONE = 'America/Los_Angeles'; // PST/PDT timezone

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to format date to ISO8601 in PST
function getISODate(daysOffset = 0) {
    const date = moment().tz(TIMEZONE).add(daysOffset, 'days');
    return date.format('YYYY-MM-DD');
}

// Helper function to get start and end of day in PST, converted to UTC for API
function getDayBounds(dateStr) {
    const startOfDay = moment.tz(`${dateStr}T00:00:00`, TIMEZONE).utc().format();
    const endOfDay = moment.tz(`${dateStr}T23:59:59`, TIMEZONE).utc().format();
    return { startOfDay, endOfDay };
}

// API route to fetch Toggl data
app.get('/api/toggl', async (req, res) => {
    try {
        const today = getISODate();
        const startDate = getISODate(-90);
        
        // Get PST day boundaries converted to UTC
        const todayBounds = getDayBounds(today);
        const startDateBounds = getDayBounds(startDate);

        // Fetch today's data using PST boundaries
        const todayResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries', {
            params: {
                start_date: todayBounds.startOfDay,
                end_date: todayBounds.endOfDay
            },
            auth: { username: TOGGL_API_TOKEN, password: 'api_token' }
        });

        // Fetch historical data using PST boundaries
        const historicalResponse = await axios.get('https://api.track.toggl.com/api/v9/me/time_entries', {
            params: {
                start_date: startDateBounds.startOfDay,
                end_date: todayBounds.startOfDay
            },
            auth: { username: TOGGL_API_TOKEN, password: 'api_token' }
        });

        // Convert response timestamps from UTC to PST
        const convertToPST = (entries) => entries.map(entry => ({
            ...entry,
            start: moment(entry.start).tz(TIMEZONE).format(),
            stop: entry.stop ? moment(entry.stop).tz(TIMEZONE).format() : null
        }));

        res.json({
            today: convertToPST(todayResponse.data),
            historical: convertToPST(historicalResponse.data)
        });
    } catch (error) {
        console.error('Error fetching Toggl data:', error.message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
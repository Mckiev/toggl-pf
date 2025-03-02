fetch('/api/toggl')
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    // Add debugging to see exact structure of the data
    console.log('Data received from API:', data);
    console.log('Today entries:', data.today ? data.today.length : 'undefined');
    console.log('Historical entries:', data.historical ? data.historical.length : 'undefined');
    
    // Sample of first entry from each array (if available)
    if (data.today && data.today.length > 0) {
      console.log('Sample today entry:', data.today[0]);
    }
    if (data.historical && data.historical.length > 0) {
      console.log('Sample historical entry:', data.historical[0]);
    }
    
    // Check for empty arrays or undefined
    if (!data.today || data.today.length === 0) {
      console.warn('No today entries available');
    }
    if (!data.historical || data.historical.length === 0) {
      console.warn('No historical entries available');
    }

    const timezone = 'America/Los_Angeles';
    const startHour = 6;
    const endHour = 22;
    
    function calculatePercentage(cumulativeWork, timePoint, dayStart) {
      const elapsedHours = timePoint.diff(dayStart, 'hours', true);
      return elapsedHours > 0 ? (cumulativeWork / elapsedHours) * 100 : 0;
    }
    
    function processEntries(entries, referenceDate) {
      // Check if entries is valid
      if (!Array.isArray(entries)) {
        console.error('Entries is not an array:', entries);
        return [];
      }
      
      console.log(`Processing ${entries.length} entries for ${referenceDate.format('YYYY-MM-DD')}`);
      
      const dayStart = moment(referenceDate).tz(timezone).startOf('day').add(startHour, 'hours');
      const dayEnd = moment(referenceDate).tz(timezone).startOf('day').add(endHour, 'hours');
      
      const now = moment().tz(timezone);
      const endTime = referenceDate.isSame(now, 'day') ? 
        moment.min(now, dayEnd) : 
        dayEnd;

      let cumulativeWork = 0;
      const percentages = [];

      // Ensure entries is an array and has required properties
      const validEntries = entries.filter(entry => {
        if (!entry || typeof entry !== 'object') {
          console.warn('Invalid entry object:', entry);
          return false;
        }
        if (!entry.start) {
          console.warn('Entry missing start time:', entry);
          return false;
        }
        return true;
      });
      
      console.log(`Valid entries: ${validEntries.length}/${entries.length}`);

      const completedEntries = validEntries
        .filter(entry => {
          if (!entry.stop) {
            console.log('Filtered out entry with no stop time:', entry.id || 'unknown');
            return false;
          }
          return true;
        })
        .filter(entry => {
          const entryDate = moment(entry.start).tz(timezone);
          const isSameDay = entryDate.isSame(referenceDate, 'day');
          if (!isSameDay) {
            console.log('Filtered out entry not on same day:', entry.id || 'unknown', 
                       'Entry date:', moment(entry.start).tz(timezone).format('YYYY-MM-DD'),
                       'Reference date:', referenceDate.format('YYYY-MM-DD'));
          }
          return isSameDay;
        })
        .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());
      
      console.log(`Completed entries after filtering: ${completedEntries.length}`);
      
      // Find first entry of the day
      if (completedEntries.length > 0) {
        const firstStart = moment(completedEntries[0].start).tz(timezone);
        const firstStartHour = firstStart.hours() + (firstStart.minutes() / 60);
        
        if (firstStartHour >= startHour && firstStartHour <= endHour) {
          percentages.push({
            x: firstStartHour,
            y: 0,
            duration: 0,
            startTime: firstStart.format('HH:mm'),
            endTime: firstStart.format('HH:mm'),
            date: referenceDate.format('YYYY-MM-DD'),
            cumulative: 0,
            elapsed: firstStart.diff(dayStart, 'hours', true),
            isInitialPoint: true
          });
        }
      }

      let lastEndTime = null;

      completedEntries.forEach(entry => {
        const start = moment(entry.start).tz(timezone);
        const stop = moment(entry.stop).tz(timezone);
        
        const effectiveStart = moment.max(start, dayStart);
        const effectiveStop = moment.min(stop, dayEnd);
        const duration = effectiveStop.diff(effectiveStart, 'hours', true);
        
        if (duration > 0) {
          const startHourOfDay = effectiveStart.hours() + (effectiveStart.minutes() / 60);
          if (lastEndTime !== null && effectiveStart.isAfter(lastEndTime)) {
            const decreasedPercentage = calculatePercentage(cumulativeWork, effectiveStart, dayStart);
            
            percentages.push({
              x: startHourOfDay,
              y: decreasedPercentage,
              duration: 0,
              startTime: start.format('HH:mm'),
              endTime: start.format('HH:mm'),
              date: referenceDate.format('YYYY-MM-DD'),
              cumulative: cumulativeWork,
              elapsed: effectiveStart.diff(dayStart, 'hours', true),
              isGapPoint: true
            });
          }

          cumulativeWork += duration;
          const hourOfDay = effectiveStop.hours() + (effectiveStop.minutes() / 60);
          const percentWorked = calculatePercentage(cumulativeWork, effectiveStop, dayStart);
          
          percentages.push({
            x: hourOfDay,
            y: percentWorked,
            duration: duration,
            startTime: start.format('HH:mm'),
            endTime: stop.format('HH:mm'),
            date: referenceDate.format('YYYY-MM-DD'),
            cumulative: cumulativeWork,
            elapsed: effectiveStop.diff(dayStart, 'hours', true)
          });

          lastEndTime = effectiveStop;
        }
      });

      // For today only, add current time point
      if (referenceDate.isSame(now, 'day')) {
        const currentHour = now.hours() + (now.minutes() / 60);
        if (currentHour >= startHour && currentHour <= endHour) {
          // Calculate current percentage
          const currentPercentage = calculatePercentage(cumulativeWork, now, dayStart);
          
          percentages.push({
            x: currentHour,
            y: currentPercentage,
            duration: 0,
            startTime: now.format('HH:mm'),
            endTime: now.format('HH:mm'),
            date: referenceDate.format('YYYY-MM-DD'),
            cumulative: cumulativeWork,
            elapsed: now.diff(dayStart, 'hours', true),
            isCurrentPoint: true
          });
        }
      }

      console.log(`Generated ${percentages.length} percentage points`);
      return percentages;
    }

    // Process today's data
    const now = moment().tz(timezone);
    console.log('Processing today data with reference date:', now.format('YYYY-MM-DD'));
    const todayPercentages = processEntries(data.today, now);
    console.log(`Today percentages: ${todayPercentages.length} points generated`);

    // Process historical data
    const historicalPoints = [];
    const historicalDays = {};
    
    if (Array.isArray(data.historical)) {
      data.historical.forEach(entry => {
        if (!entry || !entry.start) {
          console.warn('Skipping invalid historical entry:', entry);
          return;
        }
        
        const entryDate = moment(entry.start).tz(timezone);
        const dateKey = entryDate.format('YYYY-MM-DD');
        
        if (!historicalDays[dateKey]) {
          historicalDays[dateKey] = [];
        }
        historicalDays[dateKey].push(entry);
      });

      console.log(`Grouped historical data into ${Object.keys(historicalDays).length} days`);

      Object.entries(historicalDays).forEach(([date, entries]) => {
        console.log(`Processing ${entries.length} historical entries for ${date}`);
        const dayData = processEntries(entries, moment(date).tz(timezone));
        historicalPoints.push(...dayData);
      });
    } else {
      console.error('Historical data is not an array:', data.historical);
    }
    
    console.log(`Historical points: ${historicalPoints.length} total points generated`);

    // Check if we have enough data for a chart
    if (todayPercentages.length === 0 && historicalPoints.length === 0) {
      console.error('No data points generated for chart. Chart will be empty.');
      
      // Create an error message element
      const chartContainer = document.getElementById('myChart').parentNode;
      const errorMsg = document.createElement('div');
      errorMsg.className = 'error-message';
      errorMsg.style.color = 'red';
      errorMsg.style.padding = '20px';
      errorMsg.style.textAlign = 'center';
      errorMsg.innerHTML = '<p>Unable to generate chart: No data points available.</p>';
      chartContainer.appendChild(errorMsg);
      
      // Return early to avoid errors in Chart.js
      return;
    }

    // Log chart data
    console.log('Chart data ready:');
    console.log('- Today points:', todayPercentages.length);
    console.log('- Historical points:', historicalPoints.length);
    
    // Chart.js Integration
    const ctx = document.getElementById('myChart').getContext('2d');
    new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: "Historical Data",
            data: historicalPoints,
            showLine: false,
            backgroundColor: 'rgba(100, 149, 237, 0.6)',
            pointRadius: 3,
            fill: false
          },
          {
            label: "Today's Work",
            data: todayPercentages,
            showLine: true,
            borderColor: 'rgba(34, 197, 94, 0.9)',
            backgroundColor: 'rgba(34, 197, 94, 0.9)',
            borderWidth: 4,
            pointRadius: function(context) {
              if (context.raw && context.raw.isCurrentPoint) {
                return 5;
              }
              return 3;
            },
            fill: false
          }
        ]
      },
      options: {
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Time of Day (PST)' },
            min: startHour,
            max: endHour,
            ticks: {
              callback: function(value) {
                return `${value}:00`;
              }
            }
          },
          y: {
            title: { display: true, text: 'Work Time / Elapsed Time (%)' },
            beginAtZero: true,
            max: 100
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const point = context.raw;
                if (!point) {
                  console.warn('Tooltip received undefined data point');
                  return ['Invalid data point'];
                }
                
                const labels = [
                  `Date: ${point.date || 'Unknown'}`,
                  `Time: ${point.startTime || 'Unknown'}${point.isInitialPoint ? ' (Start of day)' : 
                                          point.isCurrentPoint ? ' (Current time)' :
                                          point.isGapPoint ? ' (Gap)' : 
                                          ` - ${point.endTime || 'Unknown'}`}`,
                  `Work / Elapsed: ${point.y ? point.y.toFixed(1) : 'Unknown'}%`,
                  `Work Hours: ${point.cumulative ? point.cumulative.toFixed(2) : 'Unknown'}`,
                  `Elapsed Hours: ${point.elapsed ? point.elapsed.toFixed(2) : 'Unknown'}`
                ];
                
                if (!point.isGapPoint && !point.isInitialPoint && !point.isCurrentPoint && point.duration) {
                  labels.splice(2, 0, `Session: ${(point.duration * 60).toFixed(0)} minutes`);
                }
                
                return labels;
              }
            }
          }
        }
      }
    });
  })
  .catch(error => {
    console.error('Error fetching data for chart:', error);
    
    // Display user-friendly error message
    const chartContainer = document.getElementById('myChart').parentNode;
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.style.color = 'red';
    errorMsg.style.padding = '20px';
    errorMsg.style.textAlign = 'center';
    errorMsg.innerHTML = `
      <p>Unable to load chart data. Please try again later.</p>
      <p>Error details: ${error.message}</p>
    `;
    chartContainer.appendChild(errorMsg);
  });
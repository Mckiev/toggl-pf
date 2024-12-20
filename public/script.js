fetch('/api/toggl')
  .then(response => response.json())
  .then(data => {
    const timezone = 'America/Los_Angeles';
    const startHour = 6;
    const endHour = 22;
    
    function calculatePercentage(cumulativeWork, timePoint, dayStart) {
      const elapsedHours = timePoint.diff(dayStart, 'hours', true);
      return elapsedHours > 0 ? (cumulativeWork / elapsedHours) * 100 : 0;
    }
    
    function processEntries(entries, referenceDate) {
      const dayStart = moment(referenceDate).tz(timezone).startOf('day').add(startHour, 'hours');
      const dayEnd = moment(referenceDate).tz(timezone).startOf('day').add(endHour, 'hours');
      
      const now = moment().tz(timezone);
      const endTime = referenceDate.isSame(now, 'day') ? 
        moment.min(now, dayEnd) : 
        dayEnd;

      let cumulativeWork = 0;
      const percentages = [];

      const completedEntries = entries
        .filter(entry => entry.stop)
        .filter(entry => {
          const entryDate = moment(entry.start).tz(timezone);
          return entryDate.isSame(referenceDate, 'day');
        })
        .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

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

      return percentages;
    }

    // Process today's data
    const now = moment().tz(timezone);
    const todayPercentages = processEntries(data.today, now);

    // Process historical data
    const historicalPoints = [];
    const historicalDays = {};
    
    data.historical.forEach(entry => {
      const entryDate = moment(entry.start).tz(timezone);
      const dateKey = entryDate.format('YYYY-MM-DD');
      
      if (!historicalDays[dateKey]) {
        historicalDays[dateKey] = [];
      }
      historicalDays[dateKey].push(entry);
    });

    Object.entries(historicalDays).forEach(([date, entries]) => {
      const dayData = processEntries(entries, moment(date).tz(timezone));
      historicalPoints.push(...dayData);
    });

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
                const labels = [
                  `Date: ${point.date}`,
                  `Time: ${point.startTime}${point.isInitialPoint ? ' (Start of day)' : 
                                          point.isCurrentPoint ? ' (Current time)' :
                                          point.isGapPoint ? ' (Gap)' : 
                                          ` - ${point.endTime}`}`,
                  `Work / Elapsed: ${point.y.toFixed(1)}%`,
                  `Work Hours: ${point.cumulative.toFixed(2)}`,
                  `Elapsed Hours: ${point.elapsed.toFixed(2)}`
                ];
                
                if (!point.isGapPoint && !point.isInitialPoint && !point.isCurrentPoint) {
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
  .catch(error => console.error('Error fetching data for chart:', error));
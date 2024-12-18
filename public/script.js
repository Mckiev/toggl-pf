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
      let lastEndTime = null;

      const completedEntries = entries
        .filter(entry => entry.stop)
        .filter(entry => {
          const entryDate = moment(entry.start).tz(timezone);
          return entryDate.isSame(referenceDate, 'day');
        })
        .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

      // Find first entry of the day (including ongoing entry if it's first)
      const ongoingEntry = entries.find(entry => !entry.stop);
      const allEntries = [...completedEntries];
      if (ongoingEntry) {
        allEntries.push(ongoingEntry);
      }
      
      // Add initial 0% point at the start of the first session
      if (allEntries.length > 0) {
        const firstEntry = allEntries.sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf())[0];
        const firstStart = moment(firstEntry.start).tz(timezone);
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

      completedEntries.forEach(entry => {
        const start = moment(entry.start).tz(timezone);
        const stop = moment(entry.stop).tz(timezone);
        
        const effectiveStart = moment.max(start, dayStart);
        const effectiveStop = moment.min(stop, dayEnd);
        const duration = effectiveStop.diff(effectiveStart, 'hours', true);
        
        if (duration > 0) {
          // Add decreased percentage point if there's a gap
          const startHourOfDay = effectiveStart.hours() + (effectiveStart.minutes() / 60);
          if (startHourOfDay >= startHour && startHourOfDay <= endHour) {
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
          }

          // Add session end point
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

      if (referenceDate.isSame(now, 'day')) {
        const ongoingEntry = entries.find(entry => !entry.stop);
        if (ongoingEntry) {
          const start = moment(ongoingEntry.start).tz(timezone);
          
          // Add decreased percentage point if there's a gap
          const startHourOfDay = start.hours() + (start.minutes() / 60);
          if (startHourOfDay >= startHour && startHourOfDay <= endHour) {
            if (lastEndTime !== null && start.isAfter(lastEndTime)) {
              const decreasedPercentage = calculatePercentage(cumulativeWork, start, dayStart);
              
              percentages.push({
                x: startHourOfDay,
                y: decreasedPercentage,
                duration: 0,
                startTime: start.format('HH:mm'),
                endTime: start.format('HH:mm'),
                date: referenceDate.format('YYYY-MM-DD'),
                cumulative: cumulativeWork,
                elapsed: start.diff(dayStart, 'hours', true),
                isGapPoint: true
              });
            }
          }

          const effectiveStart = moment.max(start, dayStart);
          const effectiveNow = moment.min(now, dayEnd);
          const duration = effectiveNow.diff(effectiveStart, 'hours', true);
          
          if (duration > 0) {
            cumulativeWork += duration;
            const hourOfDay = effectiveNow.hours() + (effectiveNow.minutes() / 60);
            const percentWorked = calculatePercentage(cumulativeWork, effectiveNow, dayStart);
            
            percentages.push({
              x: hourOfDay,
              y: percentWorked,
              duration: duration,
              startTime: start.format('HH:mm'),
              endTime: 'ongoing',
              date: referenceDate.format('YYYY-MM-DD'),
              cumulative: cumulativeWork,
              elapsed: effectiveNow.diff(dayStart, 'hours', true)
            });
          }
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
            borderColor: 'rgba(34, 197, 94, 0.9)',  // Changed to a softer green
            backgroundColor: 'rgba(34, 197, 94, 0.9)',  // Matching point color
            borderWidth: 4,  // Increased from 2 to 4
            pointRadius: 3,
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
                  `Time: ${point.startTime}${point.isInitialPoint ? ' (Start of day)' : point.isGapPoint ? ' (Gap)' : ` - ${point.endTime}`}`,
                  `Work / Elapsed: ${point.y.toFixed(1)}%`,
                  `Work Hours: ${point.cumulative.toFixed(2)}`,
                  `Elapsed Hours: ${point.elapsed.toFixed(2)}`
                ];
                
                if (!point.isGapPoint && !point.isInitialPoint) {
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
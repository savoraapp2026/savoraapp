    (function() {
      // Stad detectie
      var userCity = localStorage.getItem('savoraapp-city');
      var allSlides = document.querySelectorAll('.rotatie-slide');
      var track = document.getElementById('rotatieTrack');
      var dotsContainer = document.getElementById('rotatieDots');
      var cityDisplay = document.getElementById('cityName');
      var timerBar = document.getElementById('rotatieTimer');
      
      var filteredSlides = [];
      var currentIndex = 0;
      var intervalTime = 10000; // 10 sekonda
      var timerInterval;
      var progressInterval;
      
      // Fallback steden
      var cities = ['Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Fier', 'Elbasan'];
      
      function detectCity() {
        if (userCity) {
          setupSlides(userCity);
          return;
        }
        
        // Probeer GPS
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            function(pos) {
              // Simpel: gebruik dichtstbijzijnde stad op basis van coords
              var lat = pos.coords.latitude;
              var lon = pos.coords.longitude;
              // Tirana: 41.3275, 19.8187
              var d = Math.sqrt(Math.pow(lat - 41.3275, 2) + Math.pow(lon - 19.8187, 2));
              if (d < 0.15) { userCity = 'Tiranë'; }
              else if (Math.sqrt(Math.pow(lat - 41.3231, 2) + Math.pow(lon - 19.4414, 2)) < 0.15) { userCity = 'Durrës'; }
              else if (Math.sqrt(Math.pow(lat - 40.4664, 2) + Math.pow(lon - 19.4914, 2)) < 0.15) { userCity = 'Vlorë'; }
              else if (Math.sqrt(Math.pow(lat - 42.0683, 2) + Math.pow(lon - 19.5126, 2)) < 0.15) { userCity = 'Shkodër'; }
              else { userCity = 'Tiranë'; } // Default
              
              localStorage.setItem('savoraapp-city', userCity);
              setupSlides(userCity);
            },
            function() {
              // Fallback: vraag gebruiker
              userCity = 'Tiranë';
              localStorage.setItem('savoraapp-city', userCity);
              setupSlides(userCity);
            }
          );
        } else {
          userCity = 'Tiranë';
          setupSlides(userCity);
        }
      }
      
      function setupSlides(city) {
        // Filter slides op stad
        filteredSlides = [];
        allSlides.forEach(function(slide) {
          if (slide.dataset.city === city) {
            filteredSlides.push(slide);
          }
        });
        
        // Als geen reklames voor deze stad, toon alle
        if (filteredSlides.length === 0) {
          filteredSlides = Array.from(allSlides);
          cityDisplay.textContent = 'Të gjitha qytetet';
        } else {
          cityDisplay.textContent = city;
        }
        
        // Herbouw track met gefilterde slides
        track.innerHTML = '';
        dotsContainer.innerHTML = '';
        
        filteredSlides.forEach(function(slide, i) {
          track.appendChild(slide);
          
          // Maak dot
          var dot = document.createElement('div');
          dot.className = 'rotatie-dot' + (i === 0 ? ' active' : '');
          dot.addEventListener('click', function() { goToSlide(i); });
          dotsContainer.appendChild(dot);
        });
        
        currentIndex = 0;
        track.style.transform = 'translateX(0%)';
        
        // Start rotatie
        if (filteredSlides.length > 1) {
          startTimer();
        }
      }
      
      function goToSlide(index) {
        currentIndex = index;
        track.style.transform = 'translateX(-' + (index * 100) + '%)';
        
        // Update dots
        document.querySelectorAll('.rotatie-dot').forEach(function(d, i) {
          d.classList.toggle('active', i === index);
        });
        
        // Reset timer
        resetTimer();
      }
      
      function nextSlide() {
        var next = (currentIndex + 1) % filteredSlides.length;
        goToSlide(next);
      }
      
      function startTimer() {
        // Progress bar animatie
        var progress = 0;
        timerBar.style.width = '0%';
        
        progressInterval = setInterval(function() {
          progress += 100 / (intervalTime / 100);
          timerBar.style.width = progress + '%';
        }, 100);
        
        timerInterval = setInterval(function() {
          nextSlide();
          progress = 0;
          timerBar.style.width = '0%';
        }, intervalTime);
      }
      
      function resetTimer() {
        clearInterval(timerInterval);
        clearInterval(progressInterval);
        timerBar.style.width = '0%';
        if (filteredSlides.length > 1) {
          startTimer();
        }
      }
      
      // Start
      detectCity();
    })();
    

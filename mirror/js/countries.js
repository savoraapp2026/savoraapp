// Savoraapp - 193 Countries with Custom Flag Dropdown
(function() {
  'use strict';
  
  var COUNTRIES = [
    { code: "+93", iso: "af", flag: "🇦🇫", name: "Afghanistan", format: "70 123 4567" },
    { code: "+355", iso: "al", flag: "🇦🇱", name: "Albania", format: "69 123 4567" },
    { code: "+213", iso: "dz", flag: "🇩🇿", name: "Algeria", format: "551 23 45 67" },
    { code: "+376", iso: "ad", flag: "🇦🇩", name: "Andorra", format: "312 345" },
    { code: "+244", iso: "ao", flag: "🇦🇴", name: "Angola", format: "923 123 456" },
    { code: "+1", iso: "us", flag: "🇦🇬", name: "Antigua and Barbuda", format: "(268) 123 4567" },
    { code: "+54", iso: "ar", flag: "🇦🇷", name: "Argentina", format: "9 11 1234 5678" },
    { code: "+374", iso: "am", flag: "🇦🇲", name: "Armenia", format: "91 123 456" },
    { code: "+61", iso: "au", flag: "🇦🇺", name: "Australia", format: "412 345 678" },
    { code: "+43", iso: "at", flag: "🇦🇹", name: "Austria", format: "664 123456" },
    { code: "+994", iso: "az", flag: "🇦🇿", name: "Azerbaijan", format: "40 123 45 67" },
    { code: "+1", iso: "us", flag: "🇧🇸", name: "Bahamas", format: "(242) 123 4567" },
    { code: "+973", iso: "bh", flag: "🇧🇭", name: "Bahrain", format: "3600 1234" },
    { code: "+880", iso: "bd", flag: "🇧🇩", name: "Bangladesh", format: "1711 123 456" },
    { code: "+1", iso: "us", flag: "🇧🇧", name: "Barbados", format: "(246) 123 4567" },
    { code: "+375", iso: "by", flag: "🇧🇾", name: "Belarus", format: "29 123 45 67" },
    { code: "+32", iso: "be", flag: "🇧🇪", name: "Belgium", format: "470 12 34 56" },
    { code: "+501", iso: "bz", flag: "🇧🇿", name: "Belize", format: "600 1234" },
    { code: "+229", iso: "bj", flag: "🇧🇯", name: "Benin", format: "90 12 34 56" },
    { code: "+975", iso: "bt", flag: "🇧🇹", name: "Bhutan", format: "17 12 34 56" },
    { code: "+591", iso: "bo", flag: "🇧🇴", name: "Bolivia", format: "712 345 67" },
    { code: "+387", iso: "ba", flag: "🇧🇦", name: "Bosnia and Herzegovina", format: "61 123 456" },
    { code: "+267", iso: "bw", flag: "🇧🇼", name: "Botswana", format: "71 123 456" },
    { code: "+55", iso: "br", flag: "🇧🇷", name: "Brazil", format: "11 91234 5678" },
    { code: "+673", iso: "bn", flag: "🇧🇳", name: "Brunei", format: "712 3456" },
    { code: "+359", iso: "bg", flag: "🇧🇬", name: "Bulgaria", format: "89 123 4567" },
    { code: "+226", iso: "bf", flag: "🇧🇫", name: "Burkina Faso", format: "70 12 34 56" },
    { code: "+257", iso: "bi", flag: "🇧🇮", name: "Burundi", format: "79 12 34 56" },
    { code: "+238", iso: "cv", flag: "🇨🇻", name: "Cabo Verde", format: "91 23 45 67" },
    { code: "+855", iso: "kh", flag: "🇰🇭", name: "Cambodia", format: "10 123 456" },
    { code: "+237", iso: "cm", flag: "🇨🇲", name: "Cameroon", format: "6 90 12 34 56" },
    { code: "+1", iso: "us", flag: "🇨🇦", name: "Canada", format: "(416) 123 4567" },
    { code: "+236", iso: "cf", flag: "🇨🇫", name: "Central African Republic", format: "70 12 34 56" },
    { code: "+235", iso: "td", flag: "🇹🇩", name: "Chad", format: "63 12 34 56" },
    { code: "+56", iso: "cl", flag: "🇨🇱", name: "Chile", format: "9 1234 5678" },
    { code: "+86", iso: "cn", flag: "🇨🇳", name: "China", format: "138 1234 5678" },
    { code: "+57", iso: "co", flag: "🇨🇴", name: "Colombia", format: "321 123 4567" },
    { code: "+269", iso: "km", flag: "🇰🇲", name: "Comoros", format: "321 23 45" },
    { code: "+242", iso: "cg", flag: "🇨🇬", name: "Congo", format: "05 512 3456" },
    { code: "+243", iso: "cd", flag: "🇨🇩", name: "Congo (DRC)", format: "80 1 234 567" },
    { code: "+506", iso: "cr", flag: "🇨🇷", name: "Costa Rica", format: "7123 4567" },
    { code: "+225", iso: "ci", flag: "🇨🇮", name: "Côte d'Ivoire", format: "01 23 45 67 89" },
    { code: "+385", iso: "hr", flag: "🇭🇷", name: "Croatia", format: "91 123 4567" },
    { code: "+53", iso: "cu", flag: "🇨🇺", name: "Cuba", format: "5 123 4567" },
    { code: "+357", iso: "cy", flag: "🇨🇾", name: "Cyprus", format: "96 123456" },
    { code: "+420", iso: "cz", flag: "🇨🇿", name: "Czech Republic", format: "601 123 456" },
    { code: "+45", iso: "dk", flag: "🇩🇰", name: "Denmark", format: "20 12 34 56" },
    { code: "+253", iso: "dj", flag: "🇩🇯", name: "Djibouti", format: "77 12 34 56" },
    { code: "+1", iso: "us", flag: "🇩🇲", name: "Dominica", format: "(767) 123 4567" },
    { code: "+1", iso: "us", flag: "🇩🇴", name: "Dominican Republic", format: "(809) 123 4567" },
    { code: "+593", iso: "ec", flag: "🇪🇨", name: "Ecuador", format: "99 123 4567" },
    { code: "+20", iso: "eg", flag: "🇪🇬", name: "Egypt", format: "10 1234 5678" },
    { code: "+503", iso: "sv", flag: "🇸🇻", name: "El Salvador", format: "7012 3456" },
    { code: "+240", iso: "gq", flag: "🇬🇶", name: "Equatorial Guinea", format: "222 123 456" },
    { code: "+291", iso: "er", flag: "🇪🇷", name: "Eritrea", format: "7 123 456" },
    { code: "+372", iso: "ee", flag: "🇪🇪", name: "Estonia", format: "512 3456" },
    { code: "+268", iso: "sz", flag: "🇸🇿", name: "Eswatini", format: "76 12 3456" },
    { code: "+251", iso: "et", flag: "🇪🇹", name: "Ethiopia", format: "91 123 4567" },
    { code: "+679", iso: "fj", flag: "🇫🇯", name: "Fiji", format: "701 2345" },
    { code: "+358", iso: "fi", flag: "🇫🇮", name: "Finland", format: "40 123 4567" },
    { code: "+33", iso: "fr", flag: "🇫🇷", name: "France", format: "6 12 34 56 78" },
    { code: "+241", iso: "ga", flag: "🇬🇦", name: "Gabon", format: "06 12 34 56" },
    { code: "+220", iso: "gm", flag: "🇬🇲", name: "Gambia", format: "301 2345" },
    { code: "+995", iso: "ge", flag: "🇬🇪", name: "Georgia", format: "555 12 34 56" },
    { code: "+49", iso: "de", flag: "🇩🇪", name: "Germany", format: "151 234 56789" },
    { code: "+233", iso: "gh", flag: "🇬🇭", name: "Ghana", format: "24 123 4567" },
    { code: "+30", iso: "gr", flag: "🇬🇷", name: "Greece", format: "691 234 5678" },
    { code: "+1", iso: "us", flag: "🇬🇩", name: "Grenada", format: "(473) 123 4567" },
    { code: "+502", iso: "gt", flag: "🇬🇹", name: "Guatemala", format: "5123 4567" },
    { code: "+224", iso: "gn", flag: "🇬🇳", name: "Guinea", format: "621 12 34 56" },
    { code: "+245", iso: "gw", flag: "🇬🇼", name: "Guinea-Bissau", format: "955 123 456" },
    { code: "+592", iso: "gy", flag: "🇬🇾", name: "Guyana", format: "609 1234" },
    { code: "+509", iso: "ht", flag: "🇭🇹", name: "Haiti", format: "34 12 3456" },
    { code: "+504", iso: "hn", flag: "🇭🇳", name: "Honduras", format: "9123 4567" },
    { code: "+36", iso: "hu", flag: "🇭🇺", name: "Hungary", format: "20 123 4567" },
    { code: "+354", iso: "is", flag: "🇮🇸", name: "Iceland", format: "611 1234" },
    { code: "+91", iso: "in", flag: "🇮🇳", name: "India", format: "98765 43210" },
    { code: "+62", iso: "id", flag: "🇮🇩", name: "Indonesia", format: "812 3456 7890" },
    { code: "+98", iso: "ir", flag: "🇮🇷", name: "Iran", format: "912 123 4567" },
    { code: "+964", iso: "iq", flag: "🇮🇶", name: "Iraq", format: "791 123 4567" },
    { code: "+353", iso: "ie", flag: "🇮🇪", name: "Ireland", format: "85 123 4567" },
    { code: "+972", iso: "il", flag: "🇮🇱", name: "Israel", format: "50 123 4567" },
    { code: "+39", iso: "it", flag: "🇮🇹", name: "Italy", format: "312 345 6789" },
    { code: "+1", iso: "us", flag: "🇯🇲", name: "Jamaica", format: "(876) 123 4567" },
    { code: "+81", iso: "jp", flag: "🇯🇵", name: "Japan", format: "90 1234 5678" },
    { code: "+962", iso: "jo", flag: "🇯🇴", name: "Jordan", format: "7 9012 3456" },
    { code: "+7", iso: "kz", flag: "🇰🇿", name: "Kazakhstan", format: "771 000 9998" },
    { code: "+254", iso: "ke", flag: "🇰🇪", name: "Kenya", format: "712 123456" },
    { code: "+686", iso: "ki", flag: "🇰🇮", name: "Kiribati", format: "63000 123" },
    { code: "+965", iso: "kw", flag: "🇰🇼", name: "Kuwait", format: "500 12345" },
    { code: "+996", iso: "kg", flag: "🇰🇬", name: "Kyrgyzstan", format: "700 123 456" },
    { code: "+856", iso: "la", flag: "🇱🇦", name: "Laos", format: "20 12 345 678" },
    { code: "+371", iso: "lv", flag: "🇱🇻", name: "Latvia", format: "21 123 456" },
    { code: "+961", iso: "lb", flag: "🇱🇧", name: "Lebanon", format: "71 123 456" },
    { code: "+266", iso: "ls", flag: "🇱🇸", name: "Lesotho", format: "56 12 3456" },
    { code: "+231", iso: "lr", flag: "🇱🇷", name: "Liberia", format: "77 012 3456" },
    { code: "+218", iso: "ly", flag: "🇱🇾", name: "Libya", format: "91 234 5678" },
    { code: "+423", iso: "li", flag: "🇱🇮", name: "Liechtenstein", format: "660 234 567" },
    { code: "+370", iso: "lt", flag: "🇱🇹", name: "Lithuania", format: "612 34567" },
    { code: "+352", iso: "lu", flag: "🇱🇺", name: "Luxembourg", format: "621 123 456" },
    { code: "+261", iso: "mg", flag: "🇲🇬", name: "Madagascar", format: "32 12 345 67" },
    { code: "+265", iso: "mw", flag: "🇲🇼", name: "Malawi", format: "99 123 4567" },
    { code: "+60", iso: "my", flag: "🇲🇾", name: "Malaysia", format: "12 345 6789" },
    { code: "+960", iso: "mv", flag: "🇲🇻", name: "Maldives", format: "771 2345" },
    { code: "+223", iso: "ml", flag: "🇲🇱", name: "Mali", format: "76 12 34 56" },
    { code: "+356", iso: "mt", flag: "🇲🇹", name: "Malta", format: "79 123 456" },
    { code: "+692", iso: "mh", flag: "🇲🇭", name: "Marshall Islands", format: "247 1234" },
    { code: "+222", iso: "mr", flag: "🇲🇷", name: "Mauritania", format: "22 12 34 56" },
    { code: "+230", iso: "mu", flag: "🇲🇺", name: "Mauritius", format: "5123 4567" },
    { code: "+52", iso: "mx", flag: "🇲🇽", name: "Mexico", format: "1 234 567 8900" },
    { code: "+691", iso: "fm", flag: "🇫🇲", name: "Micronesia", format: "350 1234" },
    { code: "+373", iso: "md", flag: "🇲🇩", name: "Moldova", format: "790 123 45" },
    { code: "+377", iso: "mc", flag: "🇲🇨", name: "Monaco", format: "6 12 34 56 78" },
    { code: "+976", iso: "mn", flag: "🇲🇳", name: "Mongolia", format: "88 123 456" },
    { code: "+382", iso: "me", flag: "🇲🇪", name: "Montenegro", format: "67 123 456" },
    { code: "+212", iso: "ma", flag: "🇲🇦", name: "Morocco", format: "612 345 678" },
    { code: "+258", iso: "mz", flag: "🇲🇿", name: "Mozambique", format: "84 123 4567" },
    { code: "+95", iso: "mm", flag: "🇲🇲", name: "Myanmar", format: "9 123 4567" },
    { code: "+264", iso: "na", flag: "🇳🇦", name: "Namibia", format: "81 123 4567" },
    { code: "+674", iso: "nr", flag: "🇳🇷", name: "Nauru", format: "555 1234" },
    { code: "+977", iso: "np", flag: "🇳🇵", name: "Nepal", format: "984 1234567" },
    { code: "+31", iso: "nl", flag: "🇳🇱", name: "Netherlands", format: "6 12345678" },
    { code: "+64", iso: "nz", flag: "🇳🇿", name: "New Zealand", format: "21 123 4567" },
    { code: "+505", iso: "ni", flag: "🇳🇮", name: "Nicaragua", format: "8123 4567" },
    { code: "+227", iso: "ne", flag: "🇳🇪", name: "Niger", format: "90 12 34 56" },
    { code: "+234", iso: "ng", flag: "🇳🇬", name: "Nigeria", format: "802 123 4567" },
    { code: "+850", iso: "kp", flag: "🇰🇵", name: "North Korea", format: "191 234 5678" },
    { code: "+389", iso: "mk", flag: "🇲🇰", name: "North Macedonia", format: "72 123 456" },
    { code: "+47", iso: "no", flag: "🇳🇴", name: "Norway", format: "406 12 345" },
    { code: "+968", iso: "om", flag: "🇴🇲", name: "Oman", format: "92 123 456" },
    { code: "+92", iso: "pk", flag: "🇵🇰", name: "Pakistan", format: "301 2345678" },
    { code: "+680", iso: "pw", flag: "🇵🇼", name: "Palau", format: "775 1234" },
    { code: "+507", iso: "pa", flag: "🇵🇦", name: "Panama", format: "6123 4567" },
    { code: "+675", iso: "pg", flag: "🇵🇬", name: "Papua New Guinea", format: "701 2345" },
    { code: "+595", iso: "py", flag: "🇵🇾", name: "Paraguay", format: "961 456 789" },
    { code: "+51", iso: "pe", flag: "🇵🇪", name: "Peru", format: "912 345 678" },
    { code: "+63", iso: "ph", flag: "🇵🇭", name: "Philippines", format: "917 123 4567" },
    { code: "+48", iso: "pl", flag: "🇵🇱", name: "Poland", format: "512 345 678" },
    { code: "+351", iso: "pt", flag: "🇵🇹", name: "Portugal", format: "912 345 678" },
    { code: "+974", iso: "qa", flag: "🇶🇦", name: "Qatar", format: "3345 6789" },
    { code: "+40", iso: "ro", flag: "🇷🇴", name: "Romania", format: "712 345 678" },
    { code: "+7", iso: "kz", flag: "🇷🇺", name: "Russia", format: "912 345 67 89" },
    { code: "+250", iso: "rw", flag: "🇷🇼", name: "Rwanda", format: "78 123 4567" },
    { code: "+1", iso: "us", flag: "🇰🇳", name: "Saint Kitts and Nevis", format: "(869) 123 4567" },
    { code: "+1", iso: "us", flag: "🇱🇨", name: "Saint Lucia", format: "(758) 123 4567" },
    { code: "+1", iso: "us", flag: "🇻🇨", name: "Saint Vincent", format: "(784) 123 4567" },
    { code: "+685", iso: "ws", flag: "🇼🇸", name: "Samoa", format: "72 12345" },
    { code: "+378", iso: "sm", flag: "🇸🇲", name: "San Marino", format: "66 66 12 12" },
    { code: "+239", iso: "st", flag: "🇸🇹", name: "Sao Tome", format: "98 1234" },
    { code: "+966", iso: "sa", flag: "🇸🇦", name: "Saudi Arabia", format: "50 123 4567" },
    { code: "+221", iso: "sn", flag: "🇸🇳", name: "Senegal", format: "70 123 45 67" },
    { code: "+381", iso: "rs", flag: "🇷🇸", name: "Serbia", format: "64 123 4567" },
    { code: "+248", iso: "sc", flag: "🇸🇨", name: "Seychelles", format: "2 123 456" },
    { code: "+232", iso: "sl", flag: "🇸🇱", name: "Sierra Leone", format: "25 123 456" },
    { code: "+65", iso: "sg", flag: "🇸🇬", name: "Singapore", format: "8123 4567" },
    { code: "+421", iso: "sk", flag: "🇸🇰", name: "Slovakia", format: "912 123 456" },
    { code: "+386", iso: "si", flag: "🇸🇮", name: "Slovenia", format: "40 123 456" },
    { code: "+677", iso: "sb", flag: "🇸🇧", name: "Solomon Islands", format: "74 12345" },
    { code: "+252", iso: "so", flag: "🇸🇴", name: "Somalia", format: "61 234 5678" },
    { code: "+27", iso: "za", flag: "🇿🇦", name: "South Africa", format: "71 123 4567" },
    { code: "+82", iso: "kr", flag: "🇰🇷", name: "South Korea", format: "10 1234 5678" },
    { code: "+211", iso: "ss", flag: "🇸🇸", name: "South Sudan", format: "97 123 4567" },
    { code: "+34", iso: "es", flag: "🇪🇸", name: "Spain", format: "612 34 56 78" },
    { code: "+94", iso: "lk", flag: "🇱🇰", name: "Sri Lanka", format: "71 234 5678" },
    { code: "+249", iso: "sd", flag: "🇸🇩", name: "Sudan", format: "91 234 5678" },
    { code: "+597", iso: "sr", flag: "🇸🇷", name: "Suriname", format: "741 2345" },
    { code: "+46", iso: "se", flag: "🇸🇪", name: "Sweden", format: "70 123 45 67" },
    { code: "+41", iso: "ch", flag: "🇨🇭", name: "Switzerland", format: "78 123 45 67" },
    { code: "+963", iso: "sy", flag: "🇸🇾", name: "Syria", format: "932 123 456" },
    { code: "+992", iso: "tj", flag: "🇹🇯", name: "Tajikistan", format: "90 123 4567" },
    { code: "+255", iso: "tz", flag: "🇹🇿", name: "Tanzania", format: "74 123 4567" },
    { code: "+66", iso: "th", flag: "🇹🇭", name: "Thailand", format: "81 234 5678" },
    { code: "+670", iso: "tl", flag: "🇹🇱", name: "Timor-Leste", format: "77 123 4567" },
    { code: "+228", iso: "tg", flag: "🇹🇬", name: "Togo", format: "90 12 34 56" },
    { code: "+676", iso: "to", flag: "🇹🇴", name: "Tonga", format: "77 12345" },
    { code: "+1", iso: "us", flag: "🇹🇹", name: "Trinidad and Tobago", format: "(868) 123 4567" },
    { code: "+216", iso: "tn", flag: "🇹🇳", name: "Tunisia", format: "20 123 456" },
    { code: "+90", iso: "tr", flag: "🇹🇷", name: "Turkey", format: "501 234 5678" },
    { code: "+993", iso: "tm", flag: "🇹🇲", name: "Turkmenistan", format: "65 123456" },
    { code: "+688", iso: "tv", flag: "🇹🇻", name: "Tuvalu", format: "90 1234" },
    { code: "+256", iso: "ug", flag: "🇺🇬", name: "Uganda", format: "70 123 4567" },
    { code: "+380", iso: "ua", flag: "🇺🇦", name: "Ukraine", format: "50 123 4567" },
    { code: "+971", iso: "ae", flag: "🇦🇪", name: "United Arab Emirates", format: "50 123 4567" },
    { code: "+44", iso: "gb", flag: "🇬🇧", name: "United Kingdom", format: "7400 123456" },
    { code: "+1", iso: "us", flag: "🇺🇸", name: "United States", format: "(201) 123 4567" },
    { code: "+598", iso: "uy", flag: "🇺🇾", name: "Uruguay", format: "91 234 567" },
    { code: "+998", iso: "uz", flag: "🇺🇿", name: "Uzbekistan", format: "90 123 45 67" },
    { code: "+678", iso: "vu", flag: "🇻🇺", name: "Vanuatu", format: "50 12345" },
    { code: "+39", iso: "it", flag: "🇻🇦", name: "Vatican City", format: "348 123 4567" },
    { code: "+58", iso: "ve", flag: "🇻🇪", name: "Venezuela", format: "412 1234567" },
    { code: "+84", iso: "vn", flag: "🇻🇳", name: "Vietnam", format: "91 234 56 78" },
    { code: "+967", iso: "ye", flag: "🇾🇪", name: "Yemen", format: "71 234 5678" },
    { code: "+260", iso: "zm", flag: "🇿🇲", name: "Zambia", format: "95 123 4567" },
    { code: "+263", iso: "zw", flag: "🇿🇼", name: "Zimbabwe", format: "71 234 5678" }
  ];
  
  // Build and inject CSS for custom dropdown
  function injectStyles() {
    if (document.getElementById('flag-dropdown-styles')) return;
    var style = document.createElement('style');
    style.id = 'flag-dropdown-styles';
    style.textContent = `
      .flag-dropdown-wrapper { position: relative; display: inline-block; }
      .flag-dropdown-trigger { 
        height: 44px; 
        display: flex; align-items: center; justify-content: center;
        padding: 0 10px;
        min-width: 85px;
        background: var(--gray-50, #f9fafb); 
        border: 1px solid var(--gray-200, #e5e7eb); 
        border-radius: 8px; 
        cursor: pointer; user-select: none;
        transition: border-color 0.2s;
      }
      .flag-dropdown-trigger:hover { border-color: var(--primary-300, #6ee7b7); }
      .flag-dropdown-trigger::after { content: '▼'; font-size: 0.6rem; margin-left: 2px; opacity: 0.5; }
      .flag-dropdown-list { 
        display: none;
        position: absolute; 
        top: 100%; left: 0; 
        width: 320px; max-height: 300px; overflow-y: auto;
        background: white; 
        border: 1px solid #e5e7eb; 
        border-radius: 12px; 
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        z-index: 9999;
        margin-top: 4px;
        padding: 8px 0;
      }
      .flag-dropdown-list.open { display: block; }
      .flag-dropdown-list .flag-search {
        padding: 8px 12px;
        border: none;
        border-bottom: 1px solid #f3f4f6;
        outline: none;
        font-size: 0.875rem;
        width: calc(100% - 24px);
        margin: 0 12px 8px;
      }
      .flag-dropdown-list .flag-option {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px;
        cursor: pointer; font-size: 0.9rem;
        transition: background 0.15s;
      }
      .flag-dropdown-list .flag-option:hover { background: #ecfdf5; }
      .flag-dropdown-list .flag-option.selected { background: #d1fae5; font-weight: 600; }
      .flag-dropdown-list .flag-option img { width: 20px; height: 14px; border-radius: 2px; object-fit: cover; flex-shrink: 0; }
      .flag-dropdown-list .flag-option .n { flex: 1; color: #374151; }
      .flag-dropdown-list .flag-option .c { color: #9ca3af; font-size: 0.85rem; }
      .flag-dropdown-list .no-results { padding: 16px; text-align: center; color: #9ca3af; font-size: 0.85rem; }
      /* Hide original select */
      .flag-dropdown-wrapper + select,
      select.flag-dropdown-hidden { display: none !important; }
      /* Show native select on mobile as fallback */
      @media (max-width: 640px) {
        .flag-dropdown-wrapper { display: none; }
        .flag-dropdown-wrapper + select,
        select.flag-dropdown-hidden { display: block !important; }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Create custom flag dropdown
  function createFlagDropdown(selectId, defaultCode) {
    var select = document.getElementById(selectId);
    if (!select) return null;
    
    var sorted = COUNTRIES.slice().sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
    
    var current = sorted.find(function(c) { return c.code === defaultCode; }) || sorted[0];
    
    // Wrapper
    var wrapper = document.createElement('div');
    wrapper.className = 'flag-dropdown-wrapper';
    wrapper.id = 'wrapper_' + selectId;
    
    // Trigger button (flag image + dial code)
    var trigger = document.createElement('div');
    trigger.className = 'flag-dropdown-trigger';
    trigger.style.cssText = 'display:flex;align-items:center;gap:6px;padding:0 10px;font-size:0.85rem;font-weight:600;color:#374151;width:auto;min-width:80px;';
    trigger.innerHTML = '<img src="https://flagcdn.com/w40/' + current.iso + '.png" alt="" style="width:22px;height:16px;border-radius:2px;object-fit:cover;"><span>' + current.code + '</span>';
    trigger.dataset.code = current.code;
    trigger.title = current.name + ' (klik om te wisselen)';
    
    // Dropdown list
    var list = document.createElement('div');
    list.className = 'flag-dropdown-list';
    
    // Search input
    var search = document.createElement('input');
    search.type = 'text';
    search.className = 'flag-search';
    search.placeholder = 'Search country...';
    list.appendChild(search);
    
    // Options container
    var optionsContainer = document.createElement('div');
    optionsContainer.className = 'flag-options';
    
    function renderOptions(filter) {
      optionsContainer.innerHTML = '';
      var filtered = filter ? sorted.filter(function(c) {
        var q = filter.toLowerCase();
        return c.name.toLowerCase().indexOf(q) !== -1 || 
               c.code.indexOf(q) !== -1;
      }) : sorted;
      
      if (filtered.length === 0) {
        optionsContainer.innerHTML = '<div class="no-results">No countries found</div>';
        return;
      }
      
      filtered.forEach(function(country) {
        var opt = document.createElement('div');
        opt.className = 'flag-option' + (country.code === trigger.dataset.code ? ' selected' : '');
        opt.innerHTML = '<img src="https://flagcdn.com/w20/' + country.iso + '.png" style="width:20px;height:14px;border-radius:2px;object-fit:cover;flex-shrink:0;"><span class="n">' + country.name + '</span><span class="c">' + country.code + '</span>';
        opt.addEventListener('click', function() {
          trigger.innerHTML = '<img src="https://flagcdn.com/w40/' + country.iso + '.png" alt="' + country.name + '" style="width:22px;height:16px;border-radius:2px;object-fit:cover;"><span>' + country.code + '</span>';
          trigger.dataset.code = country.code;
          trigger.title = country.name + ' ' + country.code;
          select.value = country.code;
          // Update placeholder on phone input
          var input = select.closest('.phone-input, .phone-input-wrapper')?.querySelector('input[type="tel"]');
          if (input) input.placeholder = country.format;
          list.classList.remove('open');
          // Update selected class
          optionsContainer.querySelectorAll('.flag-option').forEach(function(el) { el.classList.remove('selected'); });
          opt.classList.add('selected');
          // Fire change event
          var event = new Event('change', { bubbles: true });
          select.dispatchEvent(event);
        });
        optionsContainer.appendChild(opt);
      });
    }
    
    renderOptions('');
    list.appendChild(optionsContainer);
    
    // Search functionality
    search.addEventListener('input', function() { renderOptions(this.value); });
    
    // Toggle dropdown
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = list.classList.contains('open');
      // Close all other dropdowns
      document.querySelectorAll('.flag-dropdown-list').forEach(function(l) { l.classList.remove('open'); });
      if (!isOpen) {
        list.classList.add('open');
        search.value = '';
        renderOptions('');
        search.focus();
      }
    });
    
    // Close on outside click
    document.addEventListener('click', function() { list.classList.remove('open'); });
    list.addEventListener('click', function(e) { e.stopPropagation(); });
    
    // Keyboard navigation
    search.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { list.classList.remove('open'); trigger.focus(); }
    });
    
    wrapper.appendChild(trigger);
    wrapper.appendChild(list);
    
    // Insert before select
    select.parentNode.insertBefore(wrapper, select);
    // Hide original select but keep it for form submission
    select.style.setProperty('display', 'none', 'important');
    select.style.setProperty('visibility', 'hidden', 'important');
    select.style.setProperty('width', '0', 'important');
    select.style.setProperty('height', '0', 'important');
    select.style.setProperty('position', 'absolute', 'important');
    select.style.setProperty('opacity', '0', 'important');
    select.style.setProperty('pointer-events', 'none', 'important');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');
    
    return wrapper;
  }
  
  function initCountries() {
    injectStyles();
    createFlagDropdown('phonePrefix1', '+355');
    createFlagDropdown('phonePrefix2', '+355');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCountries);
  } else {
    initCountries();
  }
  
  window.SavoraCountries = {
    list: COUNTRIES,
    getByCode: function(code) { return COUNTRIES.find(function(c) { return c.code === code; }); }
  };
})();

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('matchForm');
    const steps = document.querySelectorAll('.form-step');
    const stepIndicators = document.querySelectorAll('.step-indicator');
    const homeLogo = document.getElementById('homeLogo');
    
    // Screens
    const screens = {
        welcome: document.getElementById('screen-welcome'),
        registration: document.getElementById('screen-registration'),
        questionnaire: document.getElementById('screen-questionnaire'),
        processing: document.getElementById('screen-processing'),
        result: document.getElementById('screen-result'),
        chat: document.getElementById('screen-chat')
    };

    // Registration Form logic
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = document.getElementById('reg-password').value;
            const confirmVal = document.getElementById('reg-confirm').value;
            const errorEl = document.getElementById('reg-error');

            if (pass !== confirmVal) {
                if (errorEl) {
                    errorEl.textContent = "הסיסמאות אינן תואמות";
                    errorEl.style.display = 'block';
                }
                return;
            }

            if (errorEl) errorEl.style.display = 'none';
            // Valid registration -> Move to questionnaire
            currentStep = 1;
            updateFormSteps();
            navigateTo('questionnaire');
        });
    }

    // Expanded Mock Database - Strictly using placeholders
    const candidates = [
        {
            id: 1,
            name: "נועה",
            gender: "נקבה",
            age: 24,
            year: "שנה ב'",
            faculty: "משפטים",
            religion_identity: "יהודי",
            religious_lifestyle: "מסורתית",
            relationship_type: "קשר רציני",
            location: "ירושלים",
            perfect_date: ["בר שקט", "מסעדה יוקרתית"],
            placeholders: ["👩‍💼", "📚", "⚖️", "✨"],
            reasons: ["שניכם מחפשים קשר רציני", "התאמה גבוהה באורח החיים", "העדפות הדייטים שלכם קרובות", "שפות האהבה שלכם משלימות", "עומדת בכל תנאי החובה שהגדרת"]
        },
        {
            id: 2,
            name: "רועי",
            gender: "זכר",
            age: 25,
            year: "שנה ג'",
            faculty: "מדמ״ח והנדסה",
            religion_identity: "יהודי",
            religious_lifestyle: "חילוני",
            relationship_type: "קשר רציני",
            location: "תל אביב",
            perfect_date: ["פיקניק בטבע", "הופעה חיה"],
            placeholders: ["👨‍💻", "⚽", "🎸", "⛰️"],
            reasons: ["שניכם סטודנטים למדעים מדויקים", "סגנון חיים אורבני משותף", "אהבה משותפת להופעות", "שאיפות מקצועיות דומות", "עומד בכל תנאי החובה שהגדרת"]
        }
    ];

    let currentStep = 1;
    let formData = {};
    let currentBestMatch = null;

    function navigateTo(screenId) {
        Object.values(screens).forEach(screen => {
            if (screen) screen.classList.remove('active');
        });
        if (screens[screenId]) {
            screens[screenId].classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    if (homeLogo) {
        homeLogo.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('welcome');
        });
    }

    // Start Matching Buttons -> Go to Registration
    document.querySelectorAll('.start-matching-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo('registration');
        });
    });

    document.querySelectorAll('.next-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep()) {
                saveStepData();
                currentStep++;
                updateFormSteps();
            }
        });
    });

    document.querySelectorAll('.prev-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateFormSteps();
            }
        });
    });

    function updateFormSteps() {
        steps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.dataset.step) === currentStep) {
                step.classList.add('active');
            }
        });

        stepIndicators.forEach((ind, index) => {
            const stepNum = index + 1;
            ind.classList.remove('active', 'completed');
            if (stepNum === currentStep) {
                ind.classList.add('active');
            } else if (stepNum < currentStep) {
                ind.classList.add('completed');
            }
        });

        const labels = document.querySelectorAll('.step-labels span');
        labels.forEach((label, index) => {
            label.classList.remove('active-label');
            if (index + 1 === currentStep) {
                label.classList.add('active-label');
                label.style.opacity = '1';
                label.style.color = 'var(--accent)';
            } else if (index + 1 < currentStep) {
                label.style.opacity = '0.7';
                label.style.color = 'var(--success)';
            } else {
                label.style.opacity = '0.4';
                label.style.color = 'var(--text-secondary)';
            }
        });
    }

    function saveStepData() {
        const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
        if (!currentStepEl) return;

        const inputs = currentStepEl.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'radio') {
                if (input.checked) formData[input.name] = input.value;
            } else if (input.type === 'checkbox') {
                if (!formData[input.name]) formData[input.name] = [];
                if (input.checked) {
                    if (!formData[input.name].includes(input.value)) formData[input.name].push(input.value);
                } else {
                    formData[input.name] = formData[input.name].filter(v => v !== input.value);
                }
            } else {
                formData[input.name] = input.value;
            }
        });
    }

    function validateStep() {
        const currentStepEl = document.querySelector(`.form-step[data-step="${currentStep}"]`);
        if (!currentStepEl) return true;
        
        const requiredInputs = currentStepEl.querySelectorAll('[required]');
        let isValid = true;

        currentStepEl.querySelectorAll('.error').forEach(el => el.classList.remove('error'));

        requiredInputs.forEach(input => {
            if (input.type === 'radio') {
                const name = input.getAttribute('name');
                const radioGroup = currentStepEl.querySelectorAll(`input[name="${name}"]:checked`);
                if (radioGroup.length === 0) {
                    isValid = false;
                    currentStepEl.querySelectorAll(`input[name="${name}"] + span`).forEach(rl => rl.classList.add('error'));
                }
            } else if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
            }
        });

        if (currentStep === 4) {
            const dateChecks = currentStepEl.querySelectorAll('input[name="perfect_date"]:checked');
            if (dateChecks.length === 0) {
                isValid = false;
                currentStepEl.querySelectorAll('input[name="perfect_date"] + span').forEach(s => s.classList.add('error'));
            }
        }

        if (currentStep === 5) {
            const photoInput = document.getElementById('photoUpload');
            if (photoInput && photoInput.files.length === 0) {
                isValid = false;
                document.getElementById('uploadCard').classList.add('error');
                alert('יש להעלות לפחות תמונה אחת');
            }
        }

        return isValid;
    }

    const photoUpload = document.getElementById('photoUpload');
    const uploadCard = document.getElementById('uploadCard');
    const previewContainer = document.getElementById('previewContainer');

    if (uploadCard && photoUpload) {
        uploadCard.addEventListener('click', () => photoUpload.click());
    }

    if (photoUpload) {
        photoUpload.addEventListener('change', function() {
            if (previewContainer) {
                previewContainer.innerHTML = '';
                Array.from(this.files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = document.createElement('div');
                        img.className = 'preview-img';
                        img.style.backgroundImage = `url(${e.target.result})`;
                        previewContainer.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (validateStep()) {
                saveStepData();
                navigateTo('processing');
                
                const statusEl = document.getElementById('processing-status');
                const messages = [
                    "מנתחים את הפקולטה והעדפות הלימודים...",
                    "בודקים התאמה באורח החיים והדת...",
                    "סורקים מאות מועמדים פוטנציאליים...",
                    "מחשבים ציון התאמה עמוקה..."
                ];
                
                messages.forEach((msg, i) => {
                    setTimeout(() => {
                        if (statusEl) statusEl.textContent = msg;
                    }, i * 750);
                });

                setTimeout(() => {
                    currentBestMatch = runMatching();
                    displayResult(currentBestMatch);
                    navigateTo('result');
                }, 3000);
            }
        });
    }

    // Chat logic
    const sendBtn = document.querySelector('#send-msg-btn');
    const chatInput = document.querySelector('#chat-textarea');
    const typingInd = document.getElementById('typing-indicator');
    const emptyState = document.getElementById('chat-empty-state');
    const matchStatus = document.getElementById('match-status-badge');
    const timerArea = document.getElementById('chat-timer-area');
    let firstMessageSent = false;

    document.querySelectorAll('.start-chat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo('chat');
        });
    });

    document.querySelector('.back-to-profile').addEventListener('click', () => {
        navigateTo('result');
    });

    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', () => {
            const val = chatInput.value.trim();
            if (val) {
                if (emptyState) emptyState.style.display = 'none';
                appendMessage(val, 'msg-sent');
                chatInput.value = '';
                
                if (!firstMessageSent) {
                    firstMessageSent = true;
                    if (matchStatus) {
                        matchStatus.textContent = "השיחה התחילה — ההתאמה נשמרה";
                        matchStatus.classList.remove('active');
                        matchStatus.classList.add('saved');
                    }
                    if (timerArea) {
                        timerArea.innerHTML = '<span class="timer-icon">✅</span> <span>השיחה התחילה — ההתאמה נשמרה</span>';
                    }

                    setTimeout(() => {
                        if (typingInd) typingInd.style.display = 'block';
                        setTimeout(() => {
                            if (typingInd) typingInd.style.display = 'none';
                            const response = currentBestMatch ? `היי ${formData.fullName.split(' ')[0]}, נעים להכיר! ראיתי שיש לנו התאמה ממש גבוהה 😊` : 'היי! נעים להכיר!';
                            appendMessage(response, 'msg-received');
                        }, 2000);
                    }, 1000);
                }
            }
        });
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendBtn.click();
            }
        });
    }

    // Simulation: Close Match
    const simulateCloseBtn = document.getElementById('simulate-close-btn');
    if (simulateCloseBtn) {
        simulateCloseBtn.addEventListener('click', () => {
            if (confirm('האם לבצע סימולציית סגירת התאמה עקב חוסר פעילות?')) {
                if (emptyState) emptyState.style.display = 'none';
                if (matchStatus) {
                    matchStatus.textContent = "ההתאמה נסגרה";
                    matchStatus.classList.remove('active', 'saved');
                    matchStatus.classList.add('closed');
                }
                if (timerArea) {
                    timerArea.innerHTML = '<span class="timer-icon">🚫</span> <span>ההתאמה נסגרה כי לא נשלחה הודעה תוך 72 שעות.</span>';
                }
                if (chatInput) chatInput.disabled = true;
                if (sendBtn) sendBtn.disabled = true;
                appendMessage('המערכת: ההתאמה נסגרה באופן אוטומטי.', 'msg-received');
            }
        });
    }

    function appendMessage(text, className) {
        const msg = document.createElement('div');
        msg.className = className;
        msg.textContent = text;
        const container = document.querySelector('#chat-messages-container');
        const typing = document.getElementById('typing-indicator');
        container.insertBefore(msg, typing);
        container.scrollTop = container.scrollHeight;
    }

    function calculateMatch(user, candidate) {
        let scores = { intent: 25, lifestyle: 20, personality: 22, interests: 15, love_languages: 10 };
        const total = scores.intent + scores.lifestyle + scores.personality + scores.interests + scores.love_languages;
        return { total: total, breakdown: scores };
    }

    function runMatching() {
        // Filter based on user seeking preference
        const genderFilter = formData.seeking === "בן זוג" ? "זכר" : "נקבה";
        const eligible = candidates.filter(c => c.gender === genderFilter);
        const match = eligible.length > 0 ? eligible[0] : candidates[0];
        
        return { ...match, matchScore: 92, breakdown: calculateMatch(formData, match).breakdown };
    }

    function displayResult(match) {
        if (!match) return;
        
        // Placeholders logic
        const mainImg = document.getElementById('match-main-img');
        mainImg.textContent = match.placeholders[0];
        
        const thumbs = document.querySelectorAll('.thumb-img');
        thumbs.forEach((t, i) => {
            if (match.placeholders[i+1]) {
                t.textContent = match.placeholders[i+1];
                t.onclick = () => {
                    const oldMain = mainImg.textContent;
                    mainImg.textContent = t.textContent;
                    t.textContent = oldMain;
                };
            }
        });

        // Details
        document.querySelector('.match-score-badge').textContent = `${match.matchScore}%`;
        document.getElementById('match-name-title').textContent = `${match.name}, ${match.age}`;
        document.getElementById('match-tagline').textContent = `${match.year}, ${match.faculty}`;
        document.getElementById('match-location').textContent = match.location;
        document.getElementById('match-lifestyle').textContent = match.religious_lifestyle;
        document.getElementById('match-intent').textContent = match.relationship_type;

        // Chat header update
        document.getElementById('chat-name-val').textContent = match.name;
        document.getElementById('chat-avatar-val').textContent = match.placeholders[0];
        document.getElementById('chat-textarea').placeholder = `כתבו הודעה ל${match.name}...`;

        // Why Match update
        match.reasons.forEach((reason, i) => {
            const el = document.getElementById(`why-${i+1}`);
            if (el) el.textContent = reason;
        });

        // Breakdown
        const breakdownContainer = document.getElementById('score-items-container');
        const labels = { intent: "התאמת מטרת קשר", lifestyle: "התאמת אורח חיים", personality: "התאמת אופי", interests: "תחומי עניין ודייטים", love_languages: "שפות אהבה" };
        const maxScores = { intent: 25, lifestyle: 25, personality: 25, interests: 15, love_languages: 10 };

        breakdownContainer.innerHTML = '';
        Object.keys(match.breakdown).forEach(key => {
            const item = document.createElement('div');
            item.className = 'score-bar-item';
            item.innerHTML = `
                <div class="score-bar-label">
                    <span>${labels[key]}</span>
                    <span class="score-bar-value">${match.breakdown[key]}/${maxScores[key]}</span>
                </div>
                <div class="bar-bg"><div class="bar-fill" style="width: ${(match.breakdown[key] / maxScores[key]) * 100}%"></div></div>
            `;
            breakdownContainer.appendChild(item);
        });
        
        setTimeout(() => {
            document.querySelectorAll('.bar-fill').forEach(bar => {
                const targetWidth = bar.style.width;
                bar.style.width = '0';
                setTimeout(() => bar.style.width = targetWidth, 100);
            });
        }, 100);
    }
});
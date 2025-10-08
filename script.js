// テキストを自然な読み上げ用に加工
function preprocessTextForSpeech(text, type) {
    let processedText = text;
    
    // 句読点の後に短いポーズを追加（SSMLは使えないので文字で代用）
    processedText = processedText.replace(/、/g, '、　');
    processedText = processedText.replace(/。/g, '。　　');
    
    // カギ括弧の前後に間を入れる
    processedText = processedText.replace(/「/g, '　「');
    processedText = processedText.replace(/」/g, '」　');
    
    // 数字の読み方を調整
    processedText = processedText.replace(/(\d+)年/g, '$1ねん');
    processedText = processedText.replace(/(\d+)社/g, '$1しゃ');
    processedText = processedText.replace(/(\d+)日/g, '$1にち');
    
    // 見出しの場合は文末に長めの間を入れる
    if (type === 'heading') {
        processedText = processedText + '　　　';
    }
    
    return processedText;
}

// より自然な音声パラメータを取得
function getNaturalVoiceParams(type, textLength) {
    const params = {
        rate: speechRate,
        pitch: 1.0,
        volume: 1.0
    };
    
    // テキストタイプによる調整
    if (type === 'heading') {
        // 見出し：ゆっくり、やや低め、力強く
        params.rate = speechRate * 0.9;
        params.pitch = 0.95;
        params.volume = 1.0;
    } else if (type === 'paragraph') {
        // 段落：自然な速度、やや高め
        params.rate = speechRate;
        params.pitch = 1.05;
        params.volume = 0.95;
    } else if (type === 'profile') {
        // プロフィール：少しゆっくり
        params.rate = speechRate * 0.95;
        params.pitch = 1.0;
        params.volume = 0.95;
    }
    
    // 長いテキストは少し速めに
    if (textLength > 200) {
        params.rate = params.rate * 1.05;
    }
    
    return params;
}// グローバル変数
let currentCategory = 'all';
let currentTag = 'all';
let allTags = new Set();
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let isPaused = false;
let speechRate = 1.0;
let currentTextIndex = 0;
let articleTexts = [];
let isSeeking = false;
let isAdjustingSpeed = false;

// 初期化
function init() {
    collectAllTags();
    renderTagFilter();
    renderArticleCards();
}

// 全タグを収集
function collectAllTags() {
    articlesData.articles.forEach(article => {
        if (article.tags) {
            article.tags.forEach(tag => allTags.add(tag));
        }
    });
}

// タグフィルターを生成
function renderTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    let html = '<span class="tag active" onclick="filterByTag(\'all\')">すべて</span>';
    
    allTags.forEach(tag => {
        html += `<span class="tag" onclick="filterByTag('${tag}')">${tag}</span>`;
    });
    
    tagFilter.innerHTML = html;
}

// 記事カードを生成
function renderArticleCards() {
    const grid = document.getElementById('interviewGrid');
    let html = '';

    articlesData.articles.forEach(article => {
        const categoryMatch = currentCategory === 'all' || article.category === currentCategory;
        const tagMatch = currentTag === 'all' || (article.tags && article.tags.includes(currentTag));
        
        if (categoryMatch && tagMatch) {
            // 画像URLがある場合は画像、ない場合はアイコン（後方互換性）
            const imageHtml = article.image 
                ? `<div class="card-image"><img src="${article.image}" alt="${article.title}"></div>`
                : `<div class="card-image">${article.icon || '📄'}</div>`;
            
            html += `
                <div class="interview-card" onclick="showArticle(${article.id})">
                    ${imageHtml}
                    <div class="card-content">
                        <span class="card-category">${article.categoryLabel}</span>
                        <h3 class="card-title">${article.title}</h3>
                        <p class="card-description">${article.description}</p>
                        <div class="tags-container">
                            ${article.tags ? article.tags.map(tag => `<span class="tag">#${tag}</span>`).join('') : ''}
                        </div>
                        <p class="card-date">${article.date}</p>
                    </div>
                </div>
            `;
        }
    });

    grid.innerHTML = html;
}

// 記事詳細を表示
function showArticle(articleId) {
    const article = articlesData.articles.find(a => a.id === articleId);
    if (!article) return;

    const articleContent = document.getElementById('articleContent');
    let contentHtml = '';

    // ヘッダー部分
    contentHtml += `
        <div class="article-header">
            <span class="card-category">${article.categoryLabel}</span>
            <h1 class="article-title">${article.title}</h1>
            <div class="article-meta">
                <span>📅 ${article.date}</span>
                <span>👤 インタビュー: ${article.author}</span>
                <span>⏱️ 読了時間: ${article.readTime}</span>
            </div>
            <div class="article-tags">
                ${article.tags ? article.tags.map(tag => `<span class="article-tag">#${tag}</span>`).join('') : ''}
            </div>
        </div>
    `;

    // コンテンツ部分と音声用データの準備
    articleTexts = [];
    
    if (article.content) {
        contentHtml += '<div class="article-content">';
        
        article.content.forEach((block, index) => {
            if (block.type === 'paragraph') {
                contentHtml += `<p data-segment="${index}">${block.text}</p>`;
                articleTexts.push({ 
                    type: 'paragraph', 
                    text: block.text,
                    index: index
                });
            } else if (block.type === 'heading') {
                contentHtml += `<h3 data-segment="${index}">${block.text}</h3>`;
                articleTexts.push({ 
                    type: 'heading', 
                    text: block.text,
                    index: index
                });
            }
        });

        // プロフィールセクション（データがある場合）
        if (article.profile) {
            const profileIndex = article.content.length;
            contentHtml += `
                <div class="profile-section" data-segment="${profileIndex}">
                    <h4><strong>プロフィール</strong></h4>
                    <p><strong>${article.profile.name}</strong><br>
                    ${article.profile.title}<br>
                    ${article.profile.description}</p>
                </div>
            `;
            articleTexts.push({ 
                type: 'profile', 
                text: `プロフィール。${article.profile.name}。${article.profile.title}。${article.profile.description}`,
                index: profileIndex
            });
        }

        contentHtml += '</div>';
    } else {
        // コンテンツがない場合は準備中メッセージ
        contentHtml += `
            <div class="article-content">
                <p data-segment="0">この記事は現在準備中です。近日公開予定です。</p>
            </div>
        `;
        articleTexts = [{ type: 'paragraph', text: 'この記事は現在準備中です。近日公開予定です。', index: 0 }];
    }

    articleContent.innerHTML = contentHtml;
    
    console.log('Article loaded with', articleTexts.length, 'segments');
    
    // 音声コントロールを表示
    showSpeechControls();
    
    document.getElementById('home-page').style.display = 'none';
    document.getElementById('article-page').style.display = 'block';
    window.scrollTo(0, 0);
    closeMenu();
}

// ホーム画面を表示
function showHome() {
    document.getElementById('home-page').style.display = 'block';
    document.getElementById('article-page').style.display = 'none';
    
    // 音声を完全に停止
    stopSpeech();
    hideSpeechControls();
    
    // 記事データをクリア
    articleTexts = [];
    currentTextIndex = 0;
    
    console.log('🏠 ホームに戻りました - 音声停止');
    
    window.scrollTo(0, 0);
}

// 音声コントロールを表示
function showSpeechControls() {
    let controls = document.getElementById('speechControls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'speechControls';
        controls.className = 'speech-controls';
        controls.innerHTML = `
            <div class="speech-control-panel">
                <button class="speech-btn" id="playPauseBtn" onclick="toggleSpeech()">
                    <span id="playIcon">▶️</span>
                </button>
                <div class="progress-control">
                    <div class="time-display">
                        <span id="currentSegment">1</span> / <span id="totalSegments">0</span>
                    </div>
                    <input type="range" id="progressSlider" min="0" max="0" value="0" class="progress-slider">
                </div>
                <div class="speed-control">
                    <label>速度: <span id="speedValue">1.0</span>x</label>
                    <input type="range" id="speedSlider" min="0.25" max="4" step="0.25" value="1" class="speed-slider">
                    <div class="speed-marks">
                        <span>0.25x</span>
                        <span>1x</span>
                        <span>2x</span>
                        <span>4x</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(controls);
        
        // イベントリスナーを個別に設定
        setupSliderEvents();
        
        console.log('Speech controls created');
    }
    controls.style.display = 'block';
    
    // セグメント数を更新
    const totalSegs = articleTexts.length;
    document.getElementById('totalSegments').textContent = totalSegs;
    document.getElementById('progressSlider').max = totalSegs - 1;
    document.getElementById('progressSlider').value = 0;
    document.getElementById('currentSegment').textContent = '1';
    
    console.log('Speech controls shown, total segments:', totalSegs);
}

// スライダーのイベントリスナーを設定
function setupSliderEvents() {
    // プログレススライダー
    const progressSlider = document.getElementById('progressSlider');
    if (progressSlider) {
        progressSlider.addEventListener('pointerdown', function(e) {
            isSeeking = true;
            console.log('📊 プログレススライダー: 操作開始 - isSeeking = true');
        });
        
        progressSlider.addEventListener('input', function(e) {
            if (isSeeking) {
                updateProgressDisplay(this.value);
            }
        });
        
        progressSlider.addEventListener('change', function(e) {
            console.log('📊 プログレススライダー: change イベント');
            seekToPosition(this.value);
        });
        
        progressSlider.addEventListener('pointerup', function(e) {
            console.log('📊 プログレススライダー: pointerup - 100ms後に isSeeking = false');
            setTimeout(() => {
                isSeeking = false;
                console.log('📊 isSeeking = false 完了');
            }, 100);
        });
    }
    
    // 速度スライダー
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('pointerdown', function(e) {
            isAdjustingSpeed = true;
            console.log('🎚️ 速度スライダー: 操作開始 - isAdjustingSpeed = true');
        });
        
        speedSlider.addEventListener('input', function(e) {
            if (isAdjustingSpeed) {
                updateSpeedDisplay(this.value);
                speechRate = parseFloat(this.value);
                console.log('🎚️ 速度スライダー: input - 速度 =', this.value);
            }
        });
        
        speedSlider.addEventListener('change', function(e) {
            console.log('🎚️ 速度スライダー: change イベント');
            applySpeedChange(this.value);
        });
        
        speedSlider.addEventListener('pointerup', function(e) {
            console.log('🎚️ 速度スライダー: pointerup - applySpeedChange 呼び出し');
            applySpeedChange(this.value);
            
            // 再生中でない場合のみすぐにfalseに（再生中は applySpeedChange 内で制御）
            if (!speechSynthesis.speaking || isPaused) {
                setTimeout(() => {
                    isAdjustingSpeed = false;
                    console.log('🎚️ isAdjustingSpeed = false 完了（停止中）');
                }, 100);
            }
        });
    }
}

// 音声コントロールを非表示
function hideSpeechControls() {
    const controls = document.getElementById('speechControls');
    if (controls) {
        controls.style.display = 'none';
    }
}

// 音声再生/一時停止をトグル
function toggleSpeech() {
    console.log('🎬 toggleSpeech - speaking:', speechSynthesis.speaking, ', paused:', isPaused);
    
    if (speechSynthesis.speaking && !isPaused) {
        pauseSpeech();
    } else if (isPaused) {
        resumeSpeech();
    } else {
        startSpeech();
    }
}

// 音声再生開始
function startSpeech() {
    if (articleTexts.length === 0) {
        console.error('❌ 記事データがありません');
        return;
    }
    
    console.log('▶️ 再生開始 - セグメント数:', articleTexts.length);
    
    // すべてのフラグをリセット
    isSeeking = false;
    isAdjustingSpeed = false;
    
    currentTextIndex = 0;
    speakNextText();
    updatePlayButton(true);
}

// 次のテキストを読み上げ
function speakNextText() {
    console.log('🎤 speakNextText - index:', currentTextIndex, '/', articleTexts.length, '- isSeeking:', isSeeking, ', isAdjustingSpeed:', isAdjustingSpeed);
    
    if (currentTextIndex >= articleTexts.length) {
        console.log('記事の最後まで再生しました');
        stopSpeech();
        return;
    }
    
    const textBlock = articleTexts[currentTextIndex];
    
    if (!textBlock || !textBlock.text) {
        console.error('無効なセグメント:', currentTextIndex);
        currentTextIndex++;
        speakNextText();
        return;
    }
    
    console.log(`▶ セグメント ${currentTextIndex + 1}/${articleTexts.length} [${textBlock.type}]:`, textBlock.text.substring(0, 50) + '...');
    
    // 進行状況を更新
    updateProgress();
    
    // 該当する要素をハイライト
    highlightCurrentSegment(textBlock.index);
    
    // テキストを自然な読み上げ用に加工
    const processedText = preprocessTextForSpeech(textBlock.text, textBlock.type);
    
    currentUtterance = new SpeechSynthesisUtterance(processedText);
    
    // 自然な音声パラメータを取得
    const voiceParams = getNaturalVoiceParams(textBlock.type, textBlock.text.length);
    currentUtterance.rate = voiceParams.rate;
    currentUtterance.pitch = voiceParams.pitch;
    currentUtterance.volume = voiceParams.volume;
    currentUtterance.lang = 'ja-JP';
    
    // より自然な日本語音声を選択
    const voices = speechSynthesis.getVoices();
    const japaneseVoices = voices.filter(voice => 
        voice.lang.includes('ja') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.localService)
    );
    
    if (japaneseVoices.length > 0) {
        // 女性の声を優先的に選択（より自然に聞こえる傾向）
        const femaleVoice = japaneseVoices.find(v => 
            v.name.includes('Female') || v.name.includes('女性') || v.name.includes('Kyoko') || v.name.includes('Sayaka')
        );
        currentUtterance.voice = femaleVoice || japaneseVoices[0];
    }
    
    // 読み上げ開始時
    currentUtterance.onstart = function() {
        console.log('✓ 再生開始');
    };
    
    // 読み上げ終了時のイベント
    currentUtterance.onend = function() {
        console.log('✓ 再生完了 - この時点での isSeeking:', isSeeking, ', isAdjustingSpeed:', isAdjustingSpeed);
        
        // このutteranceが最新かチェック（速度変更で古いutteranceが発火する場合を防ぐ）
        if (this !== currentUtterance) {
            console.log('⚠️ 古いutteranceのonendイベント - 無視');
            return;
        }
        
        // フラグチェックを厳密に
        if (isSeeking || isAdjustingSpeed) {
            console.log('⏸ 次へ進むのをスキップ');
            return;
        }
        
        currentTextIndex++;
        setTimeout(() => {
            speakNextText();
        }, 100);
    };
    
    // エラー時
    currentUtterance.onerror = function(event) {
        console.error('❌ 音声エラー:', event.error, '- isSeeking:', isSeeking, ', isAdjustingSpeed:', isAdjustingSpeed);
        
        // このutteranceが最新かチェック
        if (this !== currentUtterance) {
            console.log('⚠️ 古いutteranceのonerrorイベント - 無視');
            return;
        }
        
        // エラー時もフラグチェック
        if (isSeeking || isAdjustingSpeed) {
            console.log('⏸ エラー後の進行をスキップ');
            return;
        }
        
        currentTextIndex++;
        speakNextText();
    };
    
    // 再生実行
    console.log('🔊 speechSynthesis.speak() 実行');
    speechSynthesis.speak(currentUtterance);
    isPaused = false;
}

// 現在のセグメントをハイライト
function highlightCurrentSegment(segmentIndex) {
    // 既存のハイライトを削除
    const highlighted = document.querySelectorAll('.reading-highlight');
    highlighted.forEach(el => el.classList.remove('reading-highlight'));
    
    // 新しいハイライトを追加
    const element = document.querySelector(`[data-segment="${segmentIndex}"]`);
    if (element) {
        element.classList.add('reading-highlight');
        // 要素が見える位置にスクロール
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// 進行状況を更新
function updateProgress() {
    console.log('🔍 updateProgress 呼び出し - 速度調整中:', isAdjustingSpeed, ', シーク中:', isSeeking);
    
    // スライダー操作中は更新しない
    if (isAdjustingSpeed || isSeeking) {
        console.log('⏸ プログレス更新スキップ');
        return;
    }
    
    const currentSegmentEl = document.getElementById('currentSegment');
    const progressSlider = document.getElementById('progressSlider');
    
    console.log('✅ プログレス更新実行:', currentTextIndex + 1);
    
    if (currentSegmentEl) {
        currentSegmentEl.textContent = currentTextIndex + 1;
    }
    if (progressSlider) {
        progressSlider.value = currentTextIndex;
    }
}

// プログレス表示のみ更新（ドラッグ中）
function updateProgressDisplay(position) {
    const currentSegmentEl = document.getElementById('currentSegment');
    if (currentSegmentEl) {
        currentSegmentEl.textContent = parseInt(position) + 1;
    }
}

// シーク中は一時停止
let wasPausedBeforeSeek = false;

function pauseDuringSeek() {
    isSeeking = true;
    wasPausedBeforeSeek = isPaused || !speechSynthesis.speaking;
    if (speechSynthesis.speaking && !isPaused) {
        speechSynthesis.cancel();
        console.log('⏸ シーク中：停止');
    }
}

// 指定位置にシーク
function seekToPosition(position) {
    const newIndex = parseInt(position);
    
    console.log(`🎯 シーク完了: ${newIndex + 1}/${articleTexts.length}`);
    
    // 範囲チェック
    if (newIndex < 0 || newIndex >= articleTexts.length) {
        console.error('❌ 範囲外:', newIndex);
        isSeeking = false;
        return;
    }
    
    // シーク中フラグを立てる
    isSeeking = true;
    
    // 現在の再生を完全に停止
    speechSynthesis.cancel();
    isPaused = false;
    
    // 新しい位置に移動
    currentTextIndex = newIndex;
    updateProgress();
    
    const targetBlock = articleTexts[currentTextIndex];
    console.log(`📍 移動先 [${targetBlock.type}]:`, targetBlock.text.substring(0, 30) + '...');
    
    // ハイライトを更新
    highlightCurrentSegment(targetBlock.index);
    
    // 少し待ってからシーク後の再生を開始
    setTimeout(() => {
        isSeeking = false;
        speakCurrentSegment();
    }, 300);
}

// 現在のセグメントのみを再生（シーク用）
function speakCurrentSegment() {
    if (currentTextIndex >= articleTexts.length) {
        console.log('範囲外です');
        return;
    }
    
    const textBlock = articleTexts[currentTextIndex];
    
    if (!textBlock || !textBlock.text) {
        console.error('無効なセグメント:', currentTextIndex);
        return;
    }
    
    console.log(`▶ セグメント ${currentTextIndex + 1}/${articleTexts.length} [${textBlock.type}]:`, textBlock.text.substring(0, 50) + '...');
    
    updateProgress();
    highlightCurrentSegment(textBlock.index);
    
    // テキストを自然な読み上げ用に加工
    const processedText = preprocessTextForSpeech(textBlock.text, textBlock.type);
    
    currentUtterance = new SpeechSynthesisUtterance(processedText);
    
    // 自然な音声パラメータを取得
    const voiceParams = getNaturalVoiceParams(textBlock.type, textBlock.text.length);
    currentUtterance.rate = voiceParams.rate;
    currentUtterance.pitch = voiceParams.pitch;
    currentUtterance.volume = voiceParams.volume;
    currentUtterance.lang = 'ja-JP';
    
    // より自然な日本語音声を選択
    const voices = speechSynthesis.getVoices();
    const japaneseVoices = voices.filter(voice => 
        voice.lang.includes('ja') && 
        (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.localService)
    );
    
    if (japaneseVoices.length > 0) {
        // 女性の声を優先的に選択（より自然に聞こえる傾向）
        const femaleVoice = japaneseVoices.find(v => 
            v.name.includes('Female') || v.name.includes('女性') || v.name.includes('Kyoko') || v.name.includes('Sayaka')
        );
        currentUtterance.voice = femaleVoice || japaneseVoices[0];
    }
    
    // 読み上げ開始時
    currentUtterance.onstart = function() {
        console.log('✓ 再生開始');
    };
    
    // 読み上げ終了時のイベント - シーク中でない場合のみ次へ進む
    currentUtterance.onend = function() {
        console.log('✓ 再生完了');
        if (!isSeeking) {
            currentTextIndex++;
            setTimeout(() => {
                speakNextText();
            }, 100);
        }
    };
    
    // エラー時
    currentUtterance.onerror = function(event) {
        console.error('❌ 音声エラー:', event.error);
        if (!isSeeking) {
            currentTextIndex++;
            speakNextText();
        }
    };
    
    // 再生実行
    speechSynthesis.speak(currentUtterance);
    isPaused = false;
    updatePlayButton(true);
}

// 音声一時停止
function pauseSpeech() {
    if (speechSynthesis.speaking) {
        speechSynthesis.pause();
        isPaused = true;
        updatePlayButton(false);
    }
}

// 音声再開
function resumeSpeech() {
    if (speechSynthesis.paused) {
        speechSynthesis.resume();
        isPaused = false;
        updatePlayButton(true);
    }
}

// 音声停止
function stopSpeech() {
    console.log('⏹ 音声を停止します');
    
    // シークフラグをリセット
    isSeeking = false;
    
    // 音声を完全にキャンセル
    if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
    }
    
    // 状態をリセット
    currentUtterance = null;
    isPaused = false;
    
    // UIを更新
    updatePlayButton(false);
    
    // ハイライトを削除
    const highlighted = document.querySelectorAll('.reading-highlight');
    highlighted.forEach(el => el.classList.remove('reading-highlight'));
    
    console.log('✓ 停止完了');
}

// 再生ボタンの表示を更新
function updatePlayButton(isPlaying) {
    const playIcon = document.getElementById('playIcon');
    if (playIcon) {
        playIcon.textContent = isPlaying ? '⏸️' : '▶️';
    }
}

// 速度表示のみ更新（ドラッグ中）
function updateSpeedDisplay(value) {
    const speedValueEl = document.getElementById('speedValue');
    if (speedValueEl) {
        speedValueEl.textContent = value;
    }
}

// 速度変更を適用（スライダーを離したとき）
function applySpeedChange(value) {
    console.log('📍 applySpeedChange 開始 - isAdjustingSpeed:', isAdjustingSpeed);
    
    speechRate = parseFloat(value);
    const speedValueEl = document.getElementById('speedValue');
    if (speedValueEl) {
        speedValueEl.textContent = value;
    }
    
    console.log('✅ 速度設定:', value + 'x');
    
    // 再生中の場合のみ、新しい速度で再起動
    if (speechSynthesis.speaking && !isPaused) {
        const savedIndex = currentTextIndex;
        
        console.log('🔄 速度変更のため再起動中... (位置:', savedIndex + 1, ')');
        
        // 重要：フラグをtrueに設定
        isAdjustingSpeed = true;
        
        // 古いutteranceのイベントハンドラーを無効化
        if (currentUtterance) {
            currentUtterance.onend = null;
            currentUtterance.onerror = null;
            console.log('🗑️ 古いutteranceのイベントを削除');
        }
        
        // 音声を停止
        speechSynthesis.cancel();
        currentUtterance = null;
        
        // 位置を維持
        currentTextIndex = savedIndex;
        
        // 待ってから再開
        setTimeout(() => {
            console.log('🔄 新しい速度で再生開始');
            speakNextText();
            
            // 再生が始まったらフラグをfalseに
            setTimeout(() => {
                console.log('🔄 isAdjustingSpeed を false に設定');
                isAdjustingSpeed = false;
            }, 150);
        }, 300);
    } else {
        console.log('ℹ️ 停止中のため再起動なし');
        // 停止中は即座にfalse
        isAdjustingSpeed = false;
    }
}

// 再生速度を変更（後方互換性のため残す）
function changeSpeed(value) {
    updateSpeedDisplay(value);
}

// カテゴリーでフィルター
function filterCategory(category) {
    currentCategory = category;
    renderArticleCards();
    
    // フィルター変更時も音声を停止
    if (document.getElementById('article-page').style.display === 'block') {
        showHome();
    }
}

// タグでフィルター
function filterByTag(tag) {
    currentTag = tag;
    
    // タグのアクティブ状態を更新
    const tagElements = document.querySelectorAll('#tagFilter .tag');
    tagElements.forEach(el => {
        el.classList.remove('active');
        if (el.textContent === tag || (tag === 'all' && el.textContent === 'すべて')) {
            el.classList.add('active');
        }
    });
    
    renderArticleCards();
}

// メニュー開閉
function toggleMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.querySelector('.hamburger');
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
}

function closeMenu() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.querySelector('.hamburger');
    navMenu.classList.remove('active');
    hamburger.classList.remove('active');
}

// ウィンドウリサイズ時にメニューを閉じる
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        closeMenu();
    }
});

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', function() {
    init();
    
    // 音声の読み込みを待つ
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() {
            console.log('Voices loaded');
        };
    }
});
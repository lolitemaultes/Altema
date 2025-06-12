// ==UserScript==
// @name         Altema
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Reclaim Your Family History
// @author       lolitemaultes
// @match        https://www.ancestry.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @require      https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('Altema - Ancestry Complete Harvester');

    let mediaCollection = {
        mediaItems: new Map(),
        stats: { converted: 0, peopleFound: 0, downloads: 0, totalFound: 0, loaded: 0 },
        gedDownloaded: false,
        selectedTree: null,
        availableTrees: []
    };

    let isProcessing = false;
    let shouldStop = false;
    let autoLoadStats = {
        currentThumbnails: 0,
        lastThumbnailCount: 0,
        stableCount: 0,
        scrollAttempts: 0,
        maxScrollAttempts: 60,
        loadMoreClicks: 0
    };

    let threadProgress = [];
    let activeThreads = 0;
    const maxConcurrentThreads = 5;

    let isNavUIMinimized = true;
    let isUIMinimized = true;
    let harvestUI = null;
    let statusDisplay = null;
    let detailDisplay = null;
    let thumbnailObserver = null;

    function initHarvester() {
        console.log('Initializing Altema Complete Harvester...');

        const isMemoriesPage = window.location.href.match(/\/family-tree\/tree\/.*\/memories/);

        if (!isMemoriesPage) {
            createNavigationUI();
            return;
        }

        createUI();
        extractTreeAndCollectionInfo();
        detectAvailableTrees();
        setupThumbnailObserver();

        console.log('Altema initialized on memories page!');
    }

    function extractTreeAndCollectionInfo() {
        const urlMatch = window.location.href.match(/\/tree\/(\d+)/);
        if (urlMatch) {
            window.ancestryTreeId = urlMatch[1];
            console.log(`Current Tree ID: ${window.ancestryTreeId}`);

            if (!mediaCollection.selectedTree) {
                mediaCollection.selectedTree = {
                    id: window.ancestryTreeId,
                    name: 'Current Tree'
                };
            }
        }

        const collectionMatch = window.location.href.match(/collection\/(\d+)/);
        if (collectionMatch) {
            window.ancestryCollectionId = collectionMatch[1];
            console.log(`Collection ID: ${window.ancestryCollectionId}`);
        }
    }

    function createNavigationUI() {
        const navUI = document.createElement('div');
        navUI.id = 'altema-nav-ui';
        navUI.innerHTML = `
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
    
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
    
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
    
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
    
                .altema-nav-ui {
                    animation: slideIn 0.5s ease-out;
                }
    
                .altema-nav-ui.minimizing {
                    animation: slideOut 0.3s ease-out forwards;
                }
    
                .altema-nav-minimized-bar {
                    position: fixed;
                    top: 80px;
                    right: 0;
                    background: linear-gradient(135deg, #5CB85C, #4FA84F);
                    color: white;
                    padding: 15px 8px;
                    border-radius: 15px 0 0 15px;
                    box-shadow: -3px 0 10px rgba(92, 184, 92, 0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    z-index: 10000;
                    cursor: pointer;
                    writing-mode: vertical-lr;
                    text-orientation: mixed;
                    letter-spacing: 2px;
                    user-select: none;
                    border: 2px solid #4FA84F;
                    border-right: none;
                    transition: none;
                }
    
                .altema-nav-minimized-bar.fading {
                    animation: fadeOut 0.3s ease-out forwards;
                }
    
                .nav-minimize-btn {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(92, 184, 92, 0.1);
                    border: 1px solid rgba(92, 184, 92, 0.3);
                    color: #5CB85C;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    z-index: 10001;
                }
    
                .nav-minimize-btn:hover {
                    background: rgba(92, 184, 92, 0.2);
                    border-color: #5CB85C;
                    transform: scale(1.1);
                }
    
                #nav-to-memories:hover {
                    transform: scale(1.02);
                }
    
                #nav-to-memories:active {
                    transform: scale(0.98);
                }
            </style>
    
            <!-- Minimized Bar -->
            <div id="altema-nav-minimized-bar" class="altema-nav-minimized-bar" style="display: ${isNavUIMinimized ? 'block' : 'none'};">
                ALTEMA
            </div>
    
            <!-- Full Navigation UI -->
            <div class="altema-nav-ui" id="altema-nav-full-ui" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ffffff;
                color: #5CB85C;
                padding: 20px;
                border-radius: 15px;
                border: 2px solid #5CB85C;
                box-shadow: 0 6px 20px rgba(92, 184, 92, 0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 10000;
                width: 350px;
                backdrop-filter: blur(10px);
                display: ${isNavUIMinimized ? 'none' : 'block'};
            ">
                <button class="nav-minimize-btn" id="nav-minimize-btn" title="Minimize">−</button>
                
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; text-align: center; color: #5CB85C;">
                    Altema
                </div>
    
                <div style="background: rgba(92, 184, 92, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 15px; border: 1px solid rgba(92, 184, 92, 0.2);">
                    <div style="font-weight: bold; margin-bottom: 10px; text-align: center; color: #5CB85C;">
                        Navigate to Memories Page
                    </div>
                    <div style="font-size: 13px; line-height: 1.5; margin-bottom: 15px; color: #333;">
                        Altema works on your tree's memories page where all photos are displayed.
                    </div>
                    <button id="nav-to-memories" style="
                        background: linear-gradient(135deg, #5CB85C, #4FA84F);
                        color: white;
                        border: none;
                        padding: 12px 20px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: bold;
                        width: 100%;
                        transition: transform 0.2s ease;
                        box-shadow: 0 4px 8px rgba(92, 184, 92, 0.2);
                    ">Go to Memories Page</button>
                </div>
    
                <div style="font-size: 11px; text-align: center; opacity: 0.8; color: #5CB85C;">
                    Created by lolitemaultes
                </div>
            </div>
        `;
    
        document.body.appendChild(navUI);
    
        document.getElementById('nav-to-memories').addEventListener('click', () => {
            const treeIdMatch = window.location.href.match(/\/tree\/(\d+)/);
            if (treeIdMatch) {
                const treeId = treeIdMatch[1];
                window.location.href = `https://www.ancestry.com/family-tree/tree/${treeId}/memories`;
            } else {
                window.location.href = 'https://www.ancestry.com/family-tree/trees';
            }
        });

        document.getElementById('nav-minimize-btn').addEventListener('click', minimizeNavUI);
        document.getElementById('altema-nav-minimized-bar').addEventListener('click', maximizeNavUI);
    
        console.log('Navigation UI created - directing user to memories page');
    }
    
    function minimizeNavUI() {
        const fullUI = document.getElementById('altema-nav-full-ui');
        const minimizedBar = document.getElementById('altema-nav-minimized-bar');

        fullUI.classList.add('minimizing');
        
        setTimeout(() => {
            fullUI.style.display = 'none';
            fullUI.classList.remove('minimizing');
            minimizedBar.style.display = 'block';
            minimizedBar.style.animation = 'fadeIn 0.3s ease-out';
            isNavUIMinimized = true;
        }, 300);
    }
    
    function maximizeNavUI() {
        const fullUI = document.getElementById('altema-nav-full-ui');
        const minimizedBar = document.getElementById('altema-nav-minimized-bar');
        
        minimizedBar.classList.add('fading');
        
        setTimeout(() => {
            minimizedBar.style.display = 'none';
            minimizedBar.classList.remove('fading');
            fullUI.style.display = 'block';
            fullUI.style.animation = 'slideIn 0.5s ease-out';
            isNavUIMinimized = false;
        }, 300);
    }
    async function detectAvailableTrees() {
        console.log('Detecting available trees...');

        let treesFound = false;

        try {
            console.log('Trying dashboard API...');
            const dashboardResponse = await fetch('https://www.ancestry.com/api/discoveryui/trees', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Referer': window.location.href
                }
            });

            if (dashboardResponse.ok) {
                const dashboardData = await dashboardResponse.json();
                console.log('Dashboard API response:', dashboardData);

                if (dashboardData && dashboardData.trees && dashboardData.trees.length > 0) {
                    mediaCollection.availableTrees = dashboardData.trees.map(tree => ({
                        id: tree.treeId || tree.id,
                        name: tree.treeName || tree.name || `Tree ${tree.treeId || tree.id}`,
                        isPublic: tree.isPublic || false,
                        personCount: tree.peopleCount || tree.personCount || 0
                    }));
                    treesFound = true;
                    console.log(`Found ${mediaCollection.availableTrees.length} trees via dashboard API`);
                }
            }
        } catch (error) {
            console.log('Dashboard API failed:', error);
        }

        if (!treesFound) {
            try {
                console.log('Trying alternative trees API...');
                const treesResponse = await fetch('https://www.ancestry.com/api/trees/trees', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'Referer': window.location.href
                    }
                });

                if (treesResponse.ok) {
                    const treesData = await treesResponse.json();
                    console.log('Trees API response:', treesData);

                    if (treesData && treesData.length > 0) {
                        mediaCollection.availableTrees = treesData.map(tree => ({
                            id: tree.id || tree.treeId,
                            name: tree.name || tree.title || `Tree ${tree.id}`,
                            isPublic: tree.isPublic || false,
                            personCount: tree.personCount || 0
                        }));
                        treesFound = true;
                        console.log(`Found ${mediaCollection.availableTrees.length} trees via trees API`);
                    }
                }
            } catch (error) {
                console.log('Trees API failed:', error);
            }
        }

        if (!treesFound && window.ancestryTreeId) {
            console.log('Extracting tree info from current page...');

            try {
                const treeDetailsResponse = await fetch(`https://www.ancestry.com/api/trees/tree/${window.ancestryTreeId}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'Referer': window.location.href
                    }
                });

                if (treeDetailsResponse.ok) {
                    const treeDetails = await treeDetailsResponse.json();
                    console.log('Tree details response:', treeDetails);

                    mediaCollection.availableTrees = [{
                        id: window.ancestryTreeId,
                        name: treeDetails.name || treeDetails.title || 'Current Tree',
                        isPublic: treeDetails.isPublic || false,
                        personCount: treeDetails.personCount || treeDetails.peopleCount || 0
                    }];
                    treesFound = true;
                    console.log('Found current tree details via tree API');
                }
            } catch (error) {
                console.log('Tree details API failed:', error);
            }
        }

        if (!treesFound) {
            console.log('Trying to parse tree info from DOM...');

            let treeName = 'Current Tree';

            const pageTitle = document.title;
            if (pageTitle && pageTitle.includes('Tree')) {
                const titleMatch = pageTitle.match(/(.+?)\s*(?:-|–|\|)\s*Ancestry/);
                if (titleMatch) {
                    treeName = titleMatch[1].replace(/Family Tree/, '').trim() || treeName;
                }
            }

            const treeNameElements = document.querySelectorAll('[data-testid*="tree"], [class*="tree-name"], h1, h2');
            for (const element of treeNameElements) {
                const text = element.textContent?.trim();
                if (text && text.length > 3 && text.length < 100 &&
                    !text.includes('Search') && !text.includes('Help') &&
                    (text.includes('Tree') || text.includes('Family'))) {
                    treeName = text.replace(/Family Tree/, '').trim() || treeName;
                    break;
                }
            }

            if (window.ancestryTreeId) {
                mediaCollection.availableTrees = [{
                    id: window.ancestryTreeId,
                    name: treeName,
                    isPublic: false,
                    personCount: 0
                }];
                treesFound = true;
                console.log(`Found tree from DOM: ${treeName} (${window.ancestryTreeId})`);
            }
        }

        if (!treesFound && window.ancestryTreeId) {
            console.log('Using fallback tree detection...');
            mediaCollection.availableTrees = [{
                id: window.ancestryTreeId,
                name: `Tree ${window.ancestryTreeId}`,
                isPublic: false,
                personCount: 0
            }];
            treesFound = true;
        }

        if (treesFound && mediaCollection.availableTrees.length > 0) {
            if (window.ancestryTreeId) {
                const currentTree = mediaCollection.availableTrees.find(t => t.id === window.ancestryTreeId);
                if (currentTree) {
                    mediaCollection.selectedTree = currentTree;
                } else {
                    mediaCollection.selectedTree = mediaCollection.availableTrees[0];
                }
            } else {
                mediaCollection.selectedTree = mediaCollection.availableTrees[0];
            }

            console.log(`Selected tree: ${mediaCollection.selectedTree.name} (${mediaCollection.selectedTree.id})`);
        } else {
            console.log('No trees detected');
        }

        updateTreeSelectionUI();
    }

    function setupThumbnailObserver() {
        if (thumbnailObserver) return;

        thumbnailObserver = new MutationObserver((mutations) => {
            if (isProcessing && !shouldStop) {
                let newThumbnails = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const thumbnails = node.querySelectorAll ? node.querySelectorAll('img[src*="thumbnail"]') : [];
                                if (thumbnails.length > 0 || (node.tagName === 'IMG' && node.src && node.src.includes('thumbnail'))) {
                                    newThumbnails = true;
                                }
                            }
                        });
                    }
                });

                if (newThumbnails) {
                    updateAutoLoadStats();
                }
            }
        });

        thumbnailObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('Thumbnail observer setup complete');
    }

    function createUI() {
        harvestUI = document.createElement('div');
        harvestUI.id = 'altema-harvester-ui';
        harvestUI.innerHTML = `
            <style>
                @keyframes pulse {
                    0% { box-shadow: 0 6px 20px rgba(92, 184, 92, 0.3); }
                    50% { box-shadow: 0 8px 25px rgba(92, 184, 92, 0.4); }
                    100% { box-shadow: 0 6px 20px rgba(92, 184, 92, 0.3); }
                }
    
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
    
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
    
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
    
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
    
                @keyframes progressFill {
                    from { width: 0%; }
                    to { width: var(--progress-width); }
                }
    
                @keyframes checkMark {
                    0% { transform: scale(0) rotate(45deg); }
                    50% { transform: scale(1.2) rotate(45deg); }
                    100% { transform: scale(1) rotate(45deg); }
                }
    
                .altema-ui {
                    animation: slideIn 0.5s ease-out;
                }
    
                .altema-ui.minimizing {
                    animation: slideOut 0.3s ease-out forwards;
                }
    
                .altema-ui.processing {
                    animation: pulse 2s infinite;
                }
    
                .altema-minimized-bar {
                    position: fixed;
                    top: 120px;
                    right: 0;
                    background: linear-gradient(135deg, #5CB85C, #4FA84F);
                    color: white;
                    padding: 15px 8px;
                    border-radius: 15px 0 0 15px;
                    box-shadow: -3px 0 10px rgba(92, 184, 92, 0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    z-index: 10000;
                    cursor: pointer;
                    writing-mode: vertical-lr;
                    text-orientation: mixed;
                    letter-spacing: 2px;
                    user-select: none;
                    border: 2px solid #4FA84F;
                    border-right: none;
                    transition: none;
                }
    
                .altema-minimized-bar.fading {
                    animation: fadeOut 0.3s ease-out forwards;
                }
    
                .progress-bar {
                    background: rgba(92, 184, 92, 0.2);
                    border-radius: 10px;
                    height: 8px;
                    overflow: hidden;
                    margin: 2px 0;
                    position: relative;
                }
    
                .progress-fill {
                    background: linear-gradient(90deg, #5CB85C, #4FA84F);
                    height: 100%;
                    border-radius: 10px;
                    transition: width 0.3s ease;
                    position: relative;
                }
    
                .progress-fill.complete {
                    background: linear-gradient(90deg, #5CB85C, #66BB6A);
                }
    
                .thread-item {
                    display: flex;
                    align-items: center;
                    margin: 3px 0;
                    font-size: 11px;
                    opacity: 0;
                    transform: translateX(-20px);
                    transition: all 0.3s ease;
                }
    
                .thread-item.active {
                    opacity: 1;
                    transform: translateX(0);
                }
    
                .thread-label {
                    width: 60px;
                    text-align: left;
                    font-weight: bold;
                    color: #5CB85C;
                }
    
                .thread-progress {
                    flex: 1;
                    margin: 0 8px;
                }
    
                .thread-check {
                    width: 16px;
                    height: 16px;
                    position: relative;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
    
                .thread-check.complete {
                    opacity: 1;
                }
    
                .thread-check.complete::after {
                    content: '';
                    position: absolute;
                    left: 6px;
                    top: 2px;
                    width: 4px;
                    height: 8px;
                    border: solid #5CB85C;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                    animation: checkMark 0.5s ease;
                }
    
                .main-button {
                    background: linear-gradient(135deg, #5CB85C, #4FA84F);
                    transition: all 0.3s ease;
                    transform: scale(1);
                }
    
                .main-button:hover {
                    transform: scale(1.02);
                    box-shadow: 0 6px 12px rgba(92, 184, 92, 0.3);
                }
    
                .main-button:active {
                    transform: scale(0.98);
                }
    
                .main-button.stop {
                    background: linear-gradient(135deg, #F44336, #d32f2f);
                    animation: pulse 1s infinite;
                }
    
                .stats-item {
                    transition: all 0.3s ease;
                }
    
                .stats-item.updated {
                    color: #5CB85C !important;
                    transform: scale(1.1);
                }
    
                .minimize-btn {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(92, 184, 92, 0.1);
                    border: 1px solid rgba(92, 184, 92, 0.3);
                    color: #5CB85C;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    z-index: 10001;
                }
    
                .minimize-btn:hover {
                    background: rgba(92, 184, 92, 0.2);
                    border-color: #5CB85C;
                    transform: scale(1.1);
                }
            </style>
    
            <!-- Minimized Bar -->
            <div id="altema-minimized-bar" class="altema-minimized-bar" style="display: ${isUIMinimized ? 'block' : 'none'};">
                ALTEMA
            </div>
    
            <!-- Full UI -->
            <div class="altema-ui" id="altema-full-ui" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ffffff;
                color: #5CB85C;
                padding: 20px;
                border-radius: 15px;
                border: 2px solid #5CB85C;
                box-shadow: 0 6px 20px rgba(92, 184, 92, 0.2);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                z-index: 10000;
                width: 480px;
                backdrop-filter: blur(10px);
                display: ${isUIMinimized ? 'none' : 'block'};
            ">
                <button class="minimize-btn" id="minimize-btn" title="Minimize">−</button>
                
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; text-align: center; color: #5CB85C;">
                    Altema - Reclaim Your Family History
                </div>
    
                <div id="harvest-stats" style="margin-bottom: 15px; background: rgba(92, 184, 92, 0.1); padding: 12px; border-radius: 10px; border: 1px solid rgba(92, 184, 92, 0.2);">
                    <strong style="color: #5CB85C;">Progress Summary:</strong><br>
                    <span style="color: #333;">Thumbnails:</span> <span id="thumbnail-count" class="stats-item" style="font-weight: bold; color: #5CB85C;">0</span> |
                    <span style="color: #333;">Analyzed:</span> <span id="media-count" class="stats-item" style="font-weight: bold; color: #5CB85C;">0</span><br>
                    <span style="color: #333;">People:</span> <span id="people-count" class="stats-item" style="font-weight: bold; color: #5CB85C;">0</span> |
                    <span style="color: #333;">Downloaded:</span> <span id="download-count" class="stats-item" style="font-weight: bold; color: #5CB85C;">0</span>
                </div>
    
                <div style="margin-bottom: 20px;">
                    <button id="main-action-btn" class="main-button" style="
                        color: white;
                        border: none;
                        padding: 16px 20px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: bold;
                        width: 100%;
                        box-shadow: 0 4px 8px rgba(92, 184, 92, 0.2);
                    ">MEDIA HARVEST</button>
                </div>
    
                <div id="thread-progress-container" style="
                    background: rgba(92, 184, 92, 0.1);
                    padding: 12px;
                    border-radius: 10px;
                    border: 1px solid rgba(92, 184, 92, 0.2);
                    margin-bottom: 15px;
                    display: none;
                ">
                    <div style="font-weight: bold; margin-bottom: 8px; text-align: center; color: #5CB85C;">⚡ Thread Progress:</div>
                    <div id="thread-list"></div>
                </div>
    
                <div id="detailed-status" style="
                    background: rgba(92, 184, 92, 0.1);
                    padding: 12px;
                    border-radius: 10px;
                    border: 1px solid rgba(92, 184, 92, 0.2);
                    margin-bottom: 15px;
                    min-height: 60px;
                    font-size: 13px;
                    line-height: 1.4;
                    color: #333;
                ">
                    <div style="font-weight: bold; margin-bottom: 5px; color: #5CB85C;">🟢 Status: Ready</div>
                    <div id="detail-text">Click "MEDIA HARVEST" to automatically:<br>
                    Attempt GED download (if available)<br>
                    Load all media (auto-scroll + pagination)<br>
                    Parallel analyze using real Ancestry APIs<br>
                    Download complete gallery with EXIF metadata</div>
                </div>
    
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <button id="ged-only-btn" style="
                        background: linear-gradient(135deg, #5CB85C, #4FA84F);
                        color: white;
                        border: none;
                        padding: 10px 8px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: transform 0.2s ease;
                        white-space: nowrap;
                    ">GED Only</button>
    
                    <button id="report-btn" style="
                        background: linear-gradient(135deg, #5CB85C, #4FA84F);
                        color: white;
                        border: none;
                        padding: 10px 8px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: transform 0.2s ease;
                        white-space: nowrap;
                    ">Report</button>
    
                    <button id="clear-btn" style="
                        background: linear-gradient(135deg, #dc3545, #c82333);
                        color: white;
                        border: none;
                        padding: 10px 8px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: transform 0.2s ease;
                        white-space: nowrap;
                    ">Clear</button>
                </div>
    
                <div style="font-size: 10px; text-align: center; opacity: 0.7; margin-top: 10px; color: #5CB85C;">
                    Created by lolitemaultes
                </div>
            </div>
        `;
    
        document.body.appendChild(harvestUI);
        statusDisplay = document.querySelector('#detailed-status div');
        detailDisplay = document.getElementById('detail-text');
    
        document.getElementById('main-action-btn').addEventListener('click', handleMainAction);
        document.getElementById('ged-only-btn').addEventListener('click', downloadGEDOnly);
        document.getElementById('report-btn').addEventListener('click', showReport);
        document.getElementById('clear-btn').addEventListener('click', clearCollection);
    
        document.getElementById('minimize-btn').addEventListener('click', minimizeUI);
        document.getElementById('altema-minimized-bar').addEventListener('click', maximizeUI);
    
        ['ged-only-btn', 'report-btn', 'clear-btn'].forEach(id => {
            const btn = document.getElementById(id);
            btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
            btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
        });
    
        updateAutoLoadStats();
    }
    
    function minimizeUI() {
        const fullUI = document.getElementById('altema-full-ui');
        const minimizedBar = document.getElementById('altema-minimized-bar');
        
        fullUI.classList.add('minimizing');
        
        setTimeout(() => {
            fullUI.style.display = 'none';
            fullUI.classList.remove('minimizing');
            minimizedBar.style.display = 'block';
            minimizedBar.style.animation = 'fadeIn 0.3s ease-out';
            isUIMinimized = true;
        }, 300);
    }
    
    function maximizeUI() {
        const fullUI = document.getElementById('altema-full-ui');
        const minimizedBar = document.getElementById('altema-minimized-bar');
        
        minimizedBar.classList.add('fading');
        
        setTimeout(() => {
            minimizedBar.style.display = 'none';
            minimizedBar.classList.remove('fading');
            fullUI.style.display = 'block';
            fullUI.style.animation = 'slideIn 0.5s ease-out';
            isUIMinimized = false;
        }, 300);
    }

    function updateTreeSelectionUI() {
        const selector = document.getElementById('tree-selector');
        if (!selector) return;

        selector.innerHTML = '';

        if (mediaCollection.availableTrees.length === 0) {
            selector.innerHTML = '<option value="">No trees detected - Navigate to a tree page</option>';
            updateGEDStatus(false, 'No trees available');
            return;
        }

        if (mediaCollection.availableTrees.length === 1) {
            const tree = mediaCollection.availableTrees[0];
            const peopleText = tree.personCount > 0 ? ` (${tree.personCount} people)` : '';
            selector.innerHTML = `<option value="${tree.id}" selected>${tree.name}${peopleText}</option>`;
            mediaCollection.selectedTree = tree;
            updateGEDStatus(false, 'Ready for harvest');
        } else {
            selector.innerHTML = '<option value="">Select a tree...</option>';
            mediaCollection.availableTrees.forEach(tree => {
                const option = document.createElement('option');
                option.value = tree.id;
                const peopleText = tree.personCount > 0 ? ` (${tree.personCount} people)` : '';
                option.textContent = `${tree.name}${peopleText}`;
                if (mediaCollection.selectedTree && tree.id === mediaCollection.selectedTree.id) {
                    option.selected = true;
                    updateGEDStatus(false, 'Ready for harvest');
                }
                selector.appendChild(option);
            });
        }

        console.log(`Updated tree selector with ${mediaCollection.availableTrees.length} trees`);
    }

    function handleTreeSelection(event) {
        const selectedTreeId = event.target.value;
        if (selectedTreeId) {
            mediaCollection.selectedTree = mediaCollection.availableTrees.find(t => t.id === selectedTreeId);
            console.log('Selected tree:', mediaCollection.selectedTree);

            mediaCollection.gedDownloaded = false;
            updateGEDStatus(false, 'GED export not currently available');
        }
    }

    function updateGEDStatus(downloaded, statusText) {
        const indicator = document.getElementById('ged-indicator');
        const statusTextEl = document.getElementById('ged-status-text');

        if (indicator) {
            if (downloaded) {
                indicator.classList.add('downloaded');
            } else {
                indicator.classList.remove('downloaded');
            }
        }

        if (statusTextEl) {
            statusTextEl.textContent = statusText;
        }

        mediaCollection.gedDownloaded = downloaded;
    }

    async function downloadGEDOnly() {
        if (!mediaCollection.selectedTree) {
            alert('No tree found! Please make sure you are on a tree memories page.');
            return;
        }

        const button = document.getElementById('ged-only-btn');
        const originalText = button.textContent;
        button.textContent = '⏳...';
        button.disabled = true;

        try {
            updateStatus('Downloading GED', `Attempting GED download for ${mediaCollection.selectedTree.name}...`);

            const gedData = await downloadGEDFile(mediaCollection.selectedTree);

            if (gedData) {
                const zip = new JSZip();
                zip.file(gedData.filename, gedData.content);

                const zipBlob = await zip.generateAsync({
                    type: 'blob',
                    compression: "DEFLATE",
                    compressionOptions: { level: 6 }
                });

                const timestamp = new Date().toISOString().split('T')[0];
                const filename = `${sanitizeFilename(mediaCollection.selectedTree.name)}_GED_${timestamp}.zip`;
                saveAs(zipBlob, filename);

                updateStatus('GED Downloaded', `Successfully downloaded ${gedData.filename}`);

                alert(`GED file downloaded successfully!\nFile: ${gedData.filename}\nSize: ${(gedData.content.length / 1024).toFixed(1)} KB`);
            } else {
                throw new Error('Failed to download GED file');
            }

        } catch (error) {
            console.error('Error downloading GED:', error);
            updateStatus('GED Download Failed', 'GED export not available via API');

            const helpMessage = `GED Download Instructions\n\nAncestry's GED APIs are restricted, but manual download works!\n\nStep-by-Step Process:\n\n1. Open a new tab and go to:\n   https://www.ancestry.com/family-tree/tree/${mediaCollection.selectedTree.id}/export\n\n2. Look for "Download" or "Export" button\n\n3. If you see a download URL like:\n   "...media/abc12345-6789-abcd-efgh-123456789012.ged"\n   Copy that full URL\n\n4. Come back to this tab and run Altema again\n   (It will scan the export page for download links)\n\n5. Or paste the URL in console:\n   downloadGEDFromUrl("PASTE_URL_HERE", "TreeName")\n\nAlternative:\nContinue with media harvesting for complete photo backup!`;

            if (confirm(helpMessage + '\n\nWould you like to continue with media harvesting instead?')) {
                await runCompleteProcess();
                return;
            }
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    async function downloadGEDFile(tree) {
        if (!tree || !tree.id) {
            throw new Error('No tree selected');
        }

        console.log(`Finding GED using WORKING treesui-list API for tree: ${tree.name} (${tree.id})`);
        updateDetailStatus(`Using working treesui-list API to get GED for ${tree.name}...`);

        try {
            console.log('Method 1: Using WORKING treesui-list API...');
            updateDetailStatus('Getting GED media ID from working API...');

            const workingApiUrl = `https://www.ancestry.com/api/treesui-list/trees/${tree.id}/export?timestamp=${Date.now()}`;
            console.log(`Trying working API: ${workingApiUrl}`);

            const workingResponse = await fetch(workingApiUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.6',
                    'Referer': window.location.href,
                    'Sec-Ch-Ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'User-Agent': navigator.userAgent
                }
            });

            if (workingResponse.ok) {
                const exportData = await workingResponse.json();
                console.log('Working API response:', exportData);

                if (exportData.id && exportData.format === 'GED') {
                    const gedMediaId = exportData.id;
                    const treeName = exportData.name || tree.name;
                    const status = exportData.status;

                    console.log(`Found GED media ID: ${gedMediaId}`);
                    console.log(`Tree name: ${treeName}`);
                    console.log(`Export status: ${status}`);

                    if (status === 'FINISHED') {
                        const downloadUrl = `https://www.ancestry.com/api/media/retrieval/v2/stream/namespaces/61515/media/${gedMediaId}.ged?Client=Ancestry.Trees&filename=${encodeURIComponent(treeName)}.ged`;
                        console.log(`Constructed download URL: ${downloadUrl}`);

                        updateDetailStatus('Downloading GED file using found media ID...');
                        const result = await downloadGEDFromUrl(downloadUrl, treeName);
                        if (result) {
                            console.log('GED downloaded successfully using working API!');
                            return result;
                        }
                    } else if (status === 'PROCESSING' || status === 'QUEUED') {
                        updateDetailStatus(`GED export is ${status.toLowerCase()}. Please wait and try again in a few minutes.`);
                        throw new Error(`GED export is currently ${status.toLowerCase()}. Please wait a few minutes and try again.`);
                    } else {
                        updateDetailStatus(`GED export status: ${status}. May need to trigger new export.`);
                        console.log(`⚠️ Unexpected GED status: ${status}`);
                    }
                } else {
                    console.log('⚠️ Working API response missing GED data:', exportData);
                    updateDetailStatus('Working API responded but no GED data found...');
                }
            } else {
                console.log(`⚠️ Working API failed: HTTP ${workingResponse.status}`);
                updateDetailStatus(`Working API returned ${workingResponse.status}, trying alternatives...`);
            }

            console.log('Method 2: Falling back to page scanning method...');
            updateDetailStatus('Trying page scanning fallback...');

            try {
                const exportPageUrl = `https://www.ancestry.com/family-tree/tree/${tree.id}/export`;
                const exportPageResponse = await fetch(exportPageUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Referer': window.location.href
                    }
                });

                if (exportPageResponse.ok) {
                    const exportPageHtml = await exportPageResponse.text();
                    console.log('Export page loaded, scanning for GED media ID...');

                    const gedMediaIdMatches = exportPageHtml.match(/media\/([a-f0-9-]{36})\.ged/gi);
                    if (gedMediaIdMatches && gedMediaIdMatches.length > 0) {
                        for (const match of gedMediaIdMatches) {
                            const mediaIdMatch = match.match(/media\/([a-f0-9-]{36})/i);
                            if (mediaIdMatch) {
                                const gedMediaId = mediaIdMatch[1];
                                console.log(`Found GED media ID in export page: ${gedMediaId}`);

                                const gedUrl = `https://www.ancestry.com/api/media/retrieval/v2/stream/namespaces/61515/media/${gedMediaId}.ged?Client=Ancestry.Trees&filename=${encodeURIComponent(sanitizeFilename(tree.name))}.ged`;
                                console.log(`Trying GED download with found media ID: ${gedUrl}`);

                                const result = await downloadGEDFromUrl(gedUrl, tree.name);
                                if (result) {
                                    return result;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.log(`Export page scan failed: ${error.message}`);
            }

            console.log('Method 3: Scanning current page for GED download links...');
            updateDetailStatus('Checking current page for GED download buttons...');

            const currentPageLinks = document.querySelectorAll('a[href*=".ged"], button[onclick*=".ged"], a[href*="media/"], button[onclick*="media/"]');
            for (const link of currentPageLinks) {
                const href = link.href || link.getAttribute('onclick') || link.getAttribute('data-href') || '';

                if (href && href.includes('.ged')) {
                    console.log(`Found potential GED link on current page: ${href}`);

                    let downloadUrl = href;
                    if (downloadUrl.includes('onclick')) {
                        const urlMatch = downloadUrl.match(/['"]([^'"]*\.ged[^'"]*)['"]/i);
                        if (urlMatch) downloadUrl = urlMatch[1];
                    }

                    if (!downloadUrl.startsWith('http')) {
                        downloadUrl = 'https://www.ancestry.com' + downloadUrl;
                    }

                    try {
                        const result = await downloadGEDFromUrl(downloadUrl, tree.name);
                        if (result) {
                            return result;
                        }
                    } catch (error) {
                        console.log(`Current page link failed: ${error.message}`);
                        continue;
                    }
                }
            }

            throw new Error('Could not find GED using any method. The GED export may need to be created first from your tree settings.');

        } catch (error) {
            console.error(`Error downloading GED using working APIs for tree ${tree.id}:`, error);
            throw error;
        }
    }

    async function downloadGEDFromUrl(url, treeName) {
        try {
            console.log(`Attempting GED download from: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/octet-stream, text/plain, */*',
                    'Referer': window.location.href
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const content = await response.text();

            if (!content || content.length < 100) {
                throw new Error('Downloaded file is too small to be a valid GED');
            }

            if (!content.includes('0 HEAD') && !content.includes('0 @') && !content.includes('GEDCOM')) {
                throw new Error('Downloaded file does not appear to be a valid GED file');
            }

            console.log(`GED file downloaded successfully. Size: ${content.length} bytes`);

            const filename = `${sanitizeFilename(treeName)}.ged`;
            return { filename, content };

        } catch (error) {
            console.log(`Download failed: ${error.message}`);
            throw error;
        }
    }

    async function handleMainAction() {
        const button = document.getElementById('main-action-btn');

        if (isProcessing) {
            shouldStop = true;
            updateStatus('🛑 Stopping process...', 'Stopping current operation, please wait...');
            button.disabled = true;
            button.textContent = '⏳ Stopping...';
            button.className = 'main-button';
            return;
        }

        if (!mediaCollection.selectedTree) {
            alert('Please select a tree first!');
            return;
        }

        await runCompleteProcess();
    }

    function initializeThreadProgress(totalItems) {
        const container = document.getElementById('thread-progress-container');
        const threadList = document.getElementById('thread-list');

        container.style.display = 'block';
        threadList.innerHTML = '';

        threadProgress = [];
        for (let i = 0; i < maxConcurrentThreads; i++) {
            threadProgress[i] = {
                id: i,
                progress: 0,
                completed: false,
                currentItem: '',
                total: Math.ceil(totalItems / maxConcurrentThreads)
            };

            const threadItem = document.createElement('div');
            threadItem.className = 'thread-item';
            threadItem.id = `thread-${i}`;
            threadItem.innerHTML = `
                <div class="thread-label">T${i + 1}:</div>
                <div class="thread-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill-${i}" style="width: 0%;"></div>
                    </div>
                </div>
                <div class="thread-check" id="thread-check-${i}"></div>
            `;

            threadList.appendChild(threadItem);

            setTimeout(() => {
                threadItem.classList.add('active');
            }, i * 100);
        }
    }

    function updateThreadProgress(threadId, progress, currentItem = '', completed = false) {
        const progressFill = document.getElementById(`progress-fill-${threadId}`);
        const threadCheck = document.getElementById(`thread-check-${threadId}`);
        const threadItem = document.getElementById(`thread-${threadId}`);

        if (progressFill) {
            progressFill.style.width = `${progress}%`;

            if (completed) {
                progressFill.classList.add('complete');
                threadCheck.classList.add('complete');
                threadProgress[threadId].completed = true;

                threadItem.style.background = 'rgba(76, 175, 80, 0.2)';
                setTimeout(() => {
                    threadItem.style.background = '';
                }, 1000);
            }
        }

        threadProgress[threadId].progress = progress;
        threadProgress[threadId].currentItem = currentItem;
    }

    function hideThreadProgress() {
        const container = document.getElementById('thread-progress-container');
        container.style.display = 'none';
    }

    async function runCompleteProcess() {
        console.log('STARTING HARVEST');

        isProcessing = true;
        shouldStop = false;
        const button = document.getElementById('main-action-btn');
        const uiContainer = document.querySelector('.altema-ui');

        button.textContent = 'STOP PROCESS';
        button.className = 'main-button stop';
        uiContainer.classList.add('processing');

        try {
            mediaCollection.mediaItems.clear();
            mediaCollection.stats = { converted: 0, peopleFound: 0, downloads: 0, totalFound: 0, loaded: 0 };
            autoLoadStats = {
                currentThumbnails: 0,
                lastThumbnailCount: 0,
                stableCount: 0,
                scrollAttempts: 0,
                maxScrollAttempts: 60,
                loadMoreClicks: 0
            };

            updateStatus('Phase 0: GED Download', 'Attempting family tree GED download...');

            let gedData = null;
            if (!shouldStop) {
                try {
                    gedData = await downloadGEDFile(mediaCollection.selectedTree);
                    if (gedData) {
                        console.log('GED file downloaded successfully');
                    }
                } catch (error) {
                    console.error('⚠️ GED download failed:', error);

                    updateDetailStatus('GED export not available - continuing with media harvest. For GED files, try manual export from Ancestry settings.');

                    await new Promise(resolve => setTimeout(resolve, 2000));

                    console.log('Continuing with media harvest despite GED failure...');
                }
            }

            if (shouldStop) {
                updateStatus('🛑 Process Stopped', 'Operation was cancelled by user');
                return;
            }

            updateStatus('Phase 1: Auto-Loading Media', 'Starting automatic media discovery...');

            if (!shouldStop) {
                await autoLoadAllMedia();
            }

            if (shouldStop) {
                updateStatus('🛑 Process Stopped', 'Operation was cancelled by user');
                return;
            }

            updateStatus('Phase 2: Multi-Thread Analysis', 'Using 5 parallel threads with real Ancestry APIs...');

            if (!shouldStop) {
                await analyzeAllMediaWithThreads();
            }

            if (shouldStop) {
                updateStatus('🛑 Process Stopped', 'Operation was cancelled by user');
                return;
            }

            updateStatus('Phase 3: Complete Package Creation', 'Creating package with media + EXIF metadata...');

            if (!shouldStop) {
                await downloadCompletePackage(gedData);
            }

            if (shouldStop) {
                updateStatus('🛑 Process Stopped', 'Operation was cancelled by user');
                return;
            }

            updateStatus('Harvest Complete!', `Successfully processed all media!`);

            const stats = mediaCollection.stats;
            const gedStatus = gedData ? 'GED included' : 'Media only';

            const successMessage = `HARVEST SUCCESS!\n\nFinal Results:\n• Package Type: ${gedStatus}\n• Thumbnails Found: ${autoLoadStats.currentThumbnails}\n• Media Analyzed: ${stats.converted}\n• People Identified: ${stats.peopleFound}\n• Images Downloaded: ${stats.downloads}\n\nALTEMA PACKAGE:\n• All media organized by person\n• Ready for any genealogy software!\n\n${gedData ? 'GED file included in package!' : 'For GED files, use Ancestry\'s manual export feature.'}\n\nView image properties in Windows/Mac to see embedded metadata!`;

            alert(successMessage);

        } catch (error) {
            console.error('💥 Error in complete harvest:', error);
            updateStatus('❌ Process Failed', `Error: ${error.message}`);
            alert('❌ Process failed: ' + error.message);
        } finally {
            isProcessing = false;
            shouldStop = false;
            button.textContent = 'MEDIA HARVEST';
            button.className = 'main-button';
            button.disabled = false;
            uiContainer.classList.remove('processing');
            hideThreadProgress();
        }
    }

    async function autoLoadAllMedia() {
        console.log('PHASE 1: AUTO-LOADING ALL MEDIA');
        updateStatus('Phase 1: Auto-Loading', 'Discovering all media on the page...');

        updateDetailStatus('Step 1: Auto-scrolling to load lazy content...');
        await autoScrollToLoadAll();

        if (shouldStop) return;

        updateDetailStatus('Step 2: Checking for load more buttons and pagination...');
        await handlePaginationAndLoadMore();

        if (shouldStop) return;

        updateDetailStatus('Step 3: Final content scan and image loading...');
        await finalContentScan();

        const finalCount = autoLoadStats.currentThumbnails;
        console.log(`🎉 AUTO-LOAD COMPLETE! Found ${finalCount} total thumbnails`);
        updateDetailStatus(`Auto-load complete! Found ${finalCount} thumbnails total.`);
    }

    async function autoScrollToLoadAll() {
        console.log('Starting careful auto-scroll process...');

        const scrollStep = 600;
        const scrollDelay = 2500;
        const stableThreshold = 4;
        const longWaitDelay = 5000;

        updateAutoLoadStats();
        let initialCount = autoLoadStats.currentThumbnails;

        while (autoLoadStats.scrollAttempts < autoLoadStats.maxScrollAttempts && !shouldStop) {
            const currentScrollY = window.scrollY;
            const maxScrollY = document.body.scrollHeight - window.innerHeight;

            updateDetailStatus(`Scrolling... attempt ${autoLoadStats.scrollAttempts + 1}/${autoLoadStats.maxScrollAttempts} (found ${autoLoadStats.currentThumbnails} thumbnails)`);

            if (currentScrollY >= maxScrollY - 100) {
                console.log('Reached bottom of page, waiting for final content...');
                updateDetailStatus('Reached bottom, waiting for final content to load...');
                await new Promise(resolve => setTimeout(resolve, longWaitDelay));
                break;
            }

            window.scrollBy(0, scrollStep);
            autoLoadStats.scrollAttempts++;

            console.log(`Scroll ${autoLoadStats.scrollAttempts}: ${currentScrollY} → ${window.scrollY}`);

            await new Promise(resolve => setTimeout(resolve, scrollDelay));

            if (shouldStop) return;

            const previousCount = autoLoadStats.currentThumbnails;
            updateAutoLoadStats();
            const newCount = autoLoadStats.currentThumbnails;

            if (newCount > previousCount) {
                console.log(`Found ${newCount - previousCount} new thumbnails (total: ${newCount})`);
                updateDetailStatus(`📸 Loading content... found ${newCount - previousCount} new thumbnails (total: ${newCount})`);
                autoLoadStats.stableCount = 0;

                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                autoLoadStats.stableCount++;
                console.log(`No new thumbnails found (stable count: ${autoLoadStats.stableCount})`);

                if (autoLoadStats.stableCount >= stableThreshold) {
                    console.log('Content appears stable, ending auto-scroll');
                    updateDetailStatus('Content appears stable, completing scroll phase...');
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`Auto-scroll complete. Final count: ${autoLoadStats.currentThumbnails}`);
    }

    async function handlePaginationAndLoadMore() {
        console.log('Looking for pagination and load more buttons...');
        updateDetailStatus('Checking for "Load More" buttons and pagination...');

        const loadMoreSelectors = [
            'button[class*="load"], button[class*="more"], button[class*="show"]',
            '[data-testid*="load"], [data-testid*="more"], [data-testid*="show"]',
            'a[class*="load"], a[class*="more"], a[class*="show"]',
            '.load-more, .show-more, .view-more',
            '[aria-label*="load"], [aria-label*="more"], [aria-label*="show"]'
        ];

        let clickCount = 0;
        const maxClicks = 15;

        for (const selector of loadMoreSelectors) {
            if (shouldStop) return;

            try {
                const buttons = document.querySelectorAll(selector);
                for (const button of buttons) {
                    if (shouldStop) return;

                    const text = button.textContent.toLowerCase();
                    const isVisible = button.offsetParent !== null;
                    const isEnabled = !button.disabled;

                    if (isVisible && isEnabled &&
                        (text.includes('load') || text.includes('more') || text.includes('show')) &&
                        !text.includes('less') && clickCount < maxClicks) {

                        console.log(`Clicking load more button: "${button.textContent.trim()}"`);
                        updateDetailStatus(`Clicking "${button.textContent.trim()}" button...`);

                        const beforeCount = autoLoadStats.currentThumbnails;
                        updateAutoLoadStats();

                        button.click();
                        clickCount++;
                        autoLoadStats.loadMoreClicks++;

                        await new Promise(resolve => setTimeout(resolve, 4000));

                        updateAutoLoadStats();
                        const afterCount = autoLoadStats.currentThumbnails;

                        if (afterCount > beforeCount) {
                            console.log(`Load more button worked! Added ${afterCount - beforeCount} thumbnails`);
                            updateDetailStatus(`Found ${afterCount - beforeCount} more thumbnails!`);

                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }

                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            } catch (error) {
                console.log(`⚠️ Error with selector "${selector}":`, error.message);
            }
        }

        console.log(`Pagination/Load More complete. Clicked ${clickCount} elements.`);
        updateDetailStatus(`Pagination complete. Clicked ${clickCount} buttons.`);
    }

    async function finalContentScan() {
        console.log('Performing final content scan...');
        updateDetailStatus('Final scan for any remaining content...');

        const allImages = document.querySelectorAll('img[data-src], img[loading="lazy"]');
        console.log(`Found ${allImages.length} potential lazy images`);

        if (allImages.length > 0) {
            updateDetailStatus(`Loading ${allImages.length} lazy images...`);

            allImages.forEach((img, index) => {
                if (shouldStop) return;

                if (img.dataset.src && !img.src) {
                    img.src = img.dataset.src;
                }

                if (index < 30) {
                    img.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

        updateAutoLoadStats();

        console.log('Final content scan complete');
        updateDetailStatus('Final scan complete.');
    }

    async function analyzeAllMediaWithThreads() {
        console.log('⚡⚡⚡ PHASE 2: MULTI-THREADED ANALYSIS ⚡⚡⚡');
        updateStatus('Phase 2: Multi-Thread Analysis', 'Initializing 5 parallel threads...');

        const thumbnails = findAllThumbnails();
        console.log(`Found ${thumbnails.length} thumbnails for threaded analysis`);

        if (thumbnails.length === 0) {
            updateDetailStatus('❌ No thumbnails found for analysis');
            throw new Error('No thumbnails found for analysis');
        }

        const mediaIds = extractMediaIdsFromThumbnails(thumbnails);
        console.log(`Extracted ${mediaIds.length} unique media IDs`);

        if (mediaIds.length === 0) {
            updateDetailStatus('❌ Could not extract media IDs');
            throw new Error('Could not extract media IDs from thumbnails');
        }

        initializeThreadProgress(mediaIds.length);
        updateDetailStatus(`Initialized ${maxConcurrentThreads} threads for ${mediaIds.length} items...`);

        let successCount = 0;
        let peopleFoundCount = 0;
        const itemsPerThread = Math.ceil(mediaIds.length / maxConcurrentThreads);

        const threadBatches = [];
        for (let i = 0; i < maxConcurrentThreads; i++) {
            const start = i * itemsPerThread;
            const end = Math.min(start + itemsPerThread, mediaIds.length);
            if (start < mediaIds.length) {
                threadBatches.push({
                    threadId: i,
                    items: mediaIds.slice(start, end),
                    startIndex: start
                });
            }
        }

        console.log(`Starting ${threadBatches.length} parallel threads`);
        updateDetailStatus(`Launching ${threadBatches.length} parallel analysis threads...`);

        const threadPromises = threadBatches.map(async (batch) => {
            const { threadId, items, startIndex } = batch;
            let threadSuccessCount = 0;
            let threadPeopleCount = 0;

            for (let i = 0; i < items.length && !shouldStop; i++) {
                const mediaData = items[i];
                const mediaId = mediaData.mediaId;
                const globalIndex = startIndex + i + 1;
                const threadProgress = Math.round(((i + 1) / items.length) * 100);

                updateThreadProgress(threadId, threadProgress, mediaId.substring(0, 8));

                console.log(`⚡ Thread ${threadId}: Processing ${i + 1}/${items.length} - ${mediaId}`);

                try {
                    const result = await tryMediaAPIEndpoints(mediaId);
                    const fullSizeUrls = generateFullSizeUrls(mediaData.thumbnailUrl, mediaId);

                    const completeMediaData = {
                        mediaId: mediaId,
                        thumbnailUrl: mediaData.thumbnailUrl,
                        fullSizeUrls: fullSizeUrls,
                        people: result?.people || [],
                        person: result?.people && result.people.length > 0 ? result.people[0] : null,
                        description: result?.description || '',
                        title: result?.title || '',
                        originalFilename: result?.originalFilename || '',
                        metadata: {
                            extractedAt: new Date().toISOString(),
                            method: 'threaded-parallel-api-query',
                            threadId: threadId,
                            multiPerson: result?.people && result.people.length > 1,
                            autoLoaded: true,
                            hasDescription: !!(result?.description || result?.title)
                        },
                        analyzedAt: new Date().toISOString()
                    };

                    mediaCollection.mediaItems.set(mediaId, completeMediaData);
                    threadSuccessCount++;

                    if (result?.people && result.people.length > 0) {
                        threadPeopleCount++;
                        if (result.people.length === 1) {
                            console.log(`Thread ${threadId}: Found "${result.people[0]}" for ${mediaId}`);
                        } else {
                            console.log(`Thread ${threadId}: Found ${result.people.length} people for ${mediaId}: ${result.people.join(', ')}`);
                        }
                    } else {
                        console.log(`Thread ${threadId}: Media ${mediaId} processed (no people found)`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 200));

                } catch (error) {
                    console.error(`💥 Thread ${threadId} error processing ${mediaId}:`, error);
                }
            }

            updateThreadProgress(threadId, 100, 'Complete', true);
            console.log(`Thread ${threadId} complete: ${threadSuccessCount}/${items.length} processed, ${threadPeopleCount} with people`);

            return {
                threadId,
                success: threadSuccessCount,
                peopleFound: threadPeopleCount,
                total: items.length
            };
        });

        const threadResults = await Promise.allSettled(threadPromises);

        threadResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                successCount += result.value.success;
                peopleFoundCount += result.value.peopleFound;
            }
        });

        mediaCollection.stats.converted = successCount;
        mediaCollection.stats.peopleFound = peopleFoundCount;
        mediaCollection.stats.loaded = mediaIds.length;
        updateStatsDisplay();

        console.log(`\nMULTI-THREADED ANALYSIS COMPLETE!`);
        console.log(`Final Results: ${successCount}/${mediaIds.length} processed, ${peopleFoundCount} with people`);

        updateDetailStatus(`Multi-threaded analysis complete! Processed ${successCount} media items, found ${peopleFoundCount} with people.`);

        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    async function tryMediaAPIEndpoints(mediaId) {
        const treeId = mediaCollection.selectedTree?.id || window.ancestryTreeId || 'TREE_ID_NOT_FOUND';

        try {
            const mediaApiUrl = `https://www.ancestry.com/api/media/viewer/api/trees/${treeId}/media/${mediaId}?timestamp=${Date.now()}`;

            const mediaResponse = await fetch(mediaApiUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/json',
                    'Referer': window.location.href,
                    'accept-version': '2'
                }
            });

            if (!mediaResponse.ok) {
                return null;
            }

            const mediaData = await mediaResponse.json();

            let description = '';
            let title = '';
            let originalFilename = '';

            if (mediaData.title) {
                title = mediaData.title;
            }
            if (mediaData.name) {
                title = title || mediaData.name;
            }
            if (mediaData.fileName) {
                originalFilename = mediaData.fileName;
            }
            if (mediaData.filename) {
                originalFilename = originalFilename || mediaData.filename;
            }

            if (mediaData.description) {
                description = mediaData.description;
            }
            if (mediaData.caption) {
                description = description || mediaData.caption;
            }
            if (mediaData.comments) {
                description = description || mediaData.comments;
            }

            console.log(`Found metadata for ${mediaId}: Title:"${title}" Filename:"${originalFilename}" Description:"${description}"`);

            const personIds = [];

            if (mediaData.tags && mediaData.tags.length > 0) {
                for (const tag of mediaData.tags) {
                    if (tag.tgid && tag.tgid.v) {
                        const parts = tag.tgid.v.split(':');
                        if (parts.length >= 1 && parts[0]) {
                            personIds.push(parts[0]);
                        }
                    }
                }
            }

            if (personIds.length === 0) {
                return {
                    people: [],
                    description: description,
                    title: title,
                    originalFilename: originalFilename
                };
            }

            const personApiUrl = `https://www.ancestry.com/api/media/viewer/v1/trees/${treeId}/persons?timestamp=${Date.now()}`;

            const personResponse = await fetch(personApiUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Content-Type': 'application/json',
                    'Referer': window.location.href
                },
                body: JSON.stringify(personIds)
            });

            if (!personResponse.ok) {
                return {
                    people: [],
                    description: description,
                    title: title,
                    originalFilename: originalFilename
                };
            }

            const personData = await personResponse.json();
            const people = [];

            if (personData && personData.length > 0) {
                for (const person of personData) {
                    if (person.name) {
                        const cleanedName = cleanPersonName(person.name);
                        if (cleanedName) {
                            people.push(cleanedName);
                        }
                    }
                }
            }

            return {
                people: people.length > 0 ? people : [],
                description: description,
                title: title,
                originalFilename: originalFilename
            };

        } catch (error) {
            console.error(`💥 Error using real API endpoints for ${mediaId}:`, error);
            return null;
        }
    }

    async function downloadCompletePackage(gedData) {
        console.log('PHASE 3: CREATING MEDIA PACKAGE WITH EXIF METADATA');
        updateStatus('Phase 3: Package Creation', 'Creating media package with EXIF metadata...');

        const zip = new JSZip();

        if (gedData) {
            zip.file(gedData.filename, gedData.content);
            console.log(`Added GED file: ${gedData.filename}`);
        }

        const mediaFolder = zip.folder('ancestry_media');

        if (mediaCollection.mediaItems.size === 0) {
            if (gedData) {
                updateDetailStatus('No media found, downloading GED file only...');

                const zipBlob = await zip.generateAsync({
                    type: 'blob',
                    compression: "DEFLATE",
                    compressionOptions: { level: 6 }
                });

                const timestamp = new Date().toISOString().split('T')[0];
                const filename = `${sanitizeFilename(mediaCollection.selectedTree.name)}_ged_${timestamp}.zip`;
                saveAs(zipBlob, filename);

                updateDetailStatus(`Package created: ${filename}`);
                return;
            } else {
                throw new Error('No media or GED file found for download');
            }
        }

        let downloadCount = 0;
        let errorCount = 0;
        const mediaItems = Array.from(mediaCollection.mediaItems.values());

        console.log(`Starting download of ${mediaItems.length} media items with EXIF embedding...`);
        const packageType = gedData ? 'GED + media' : 'media only';
        updateDetailStatus(`Creating ${packageType} package: ${mediaItems.length} media items...`);

        const batchSize = 3;
        for (let i = 0; i < mediaItems.length && !shouldStop; i += batchSize) {
            const batch = mediaItems.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(mediaItems.length / batchSize);

            updateDetailStatus(`Processing batch ${batchNumber}/${totalBatches} (${downloadCount} completed so far)...`);

            const batchPromises = batch.map(async (mediaItem) => {
                if (shouldStop) return { success: false, error: 'Stopped by user' };

                const { mediaId, fullSizeUrls, people, person, description, title, originalFilename, metadata } = mediaItem;
                const associatedPeople = people && people.length > 0 ? people : (person ? [person] : []);

                for (let attempt = 0; attempt < fullSizeUrls.length; attempt++) {
                    const strategy = fullSizeUrls[attempt];
                    const url = strategy.url;

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);

                        let fetchOptions = {
                            signal: controller.signal,
                            headers: {
                                'Accept': 'image/*,*/*',
                                'Referer': window.location.href
                            }
                        };

                        if (url.includes('ancestry.com') && !url.includes('mediasvc')) {
                            fetchOptions.credentials = 'include';
                        }

                        const response = await fetch(url, fetchOptions);
                        clearTimeout(timeoutId);

                        if (response.ok) {
                            const blob = await response.blob();
                            const minSize = strategy.type === 'large-thumbnail' ? 5000 : 10000;

                            if (blob.size > minSize) {
                                let filename = '';
                                if (originalFilename && originalFilename.trim()) {
                                    filename = sanitizeFilename(originalFilename);
                                    if (!filename.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
                                        filename += '.jpg';
                                    }
                                } else if (title && title.trim()) {
                                    filename = sanitizeFilename(title) + '.jpg';
                                } else {
                                    const timestamp = Date.now();
                                    const random = Math.random().toString(36).substring(2, 8);
                                    filename = `${mediaId.substring(0, 8)}_${timestamp}_${random}.jpg`;
                                }

                                const imageWithMetadata = await embedMetadataInImage(blob, {
                                    title: title || originalFilename || filename,
                                    description: description || '',
                                    people: associatedPeople,
                                    mediaId: mediaId,
                                    extractedAt: new Date().toISOString(),
                                    treeName: mediaCollection.selectedTree?.name || 'Unknown Tree'
                                });

                                if (associatedPeople.length > 0) {
                                    for (const personName of associatedPeople) {
                                        const safeFolderName = makeSafeFolderName(personName);
                                        const targetFolder = mediaFolder.folder(safeFolderName);
                                        targetFolder.file(filename, imageWithMetadata);
                                    }
                                } else {
                                    const unknownFolder = mediaFolder.folder('Unknown_People');
                                    unknownFolder.file(filename, imageWithMetadata);
                                }

                                return { success: true, filename, size: blob.size, people: associatedPeople };
                            } else {
                                throw new Error(`Content too small: ${blob.size} bytes`);
                            }
                        } else {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                    } catch (error) {
                        if (attempt === fullSizeUrls.length - 1) {
                            return { success: false, error: error.message, mediaId };
                        }
                        continue;
                    }
                }
                return { success: false, error: 'All strategies exhausted', mediaId };
            });

            const batchResults = await Promise.allSettled(batchPromises);

            batchResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value?.success) {
                    downloadCount++;
                } else {
                    errorCount++;
                }
            });

            mediaCollection.stats.downloads = downloadCount;
            updateStatsDisplay();

            if (i + batchSize < mediaItems.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (shouldStop) {
            throw new Error('Download stopped by user');
        }

        if (downloadCount > 0 || gedData) {
            updateDetailStatus('Creating final package...');
            console.log(`Generating package with ${gedData ? 'GED + ' : ''}${downloadCount} images...`);

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            });

            const timestamp = new Date().toISOString().split('T')[0];
            const treeName = sanitizeFilename(mediaCollection.selectedTree?.name || 'ancestry');
            const packageSuffix = gedData ? 'complete' : 'media';
            const filename = `${treeName}_${packageSuffix}_${timestamp}.zip`;

            saveAs(zipBlob, filename);

            updateDetailStatus(`Altema package ready! Saved as ${filename}`);
            console.log(`Altema package ready! GED: ${gedData ? 'Yes' : 'No'}, Images: ${downloadCount}/${mediaItems.length}`);
        } else {
            throw new Error('No content downloaded successfully');
        }
    }

    async function embedMetadataInImage(imageBlob, metadata) {
        try {
            console.log(`Embedding EXIF metadata into image: ${metadata.title}`);

            const arrayBuffer = await imageBlob.arrayBuffer();
            const binary = new Uint8Array(arrayBuffer);

            let exifDict = {
                "0th": {},
                "Exif": {},
                "GPS": {},
                "1st": {},
                "thumbnail": null
            };

            if (metadata.title) {
                exifDict["0th"][piexif.ImageIFD.DocumentName] = metadata.title;
                exifDict["0th"][piexif.ImageIFD.XPTitle] = metadata.title;
            }

            if (metadata.description) {
                exifDict["0th"][piexif.ImageIFD.ImageDescription] = metadata.description;
                exifDict["0th"][piexif.ImageIFD.XPComment] = metadata.description;
                exifDict["Exif"][piexif.ExifIFD.UserComment] = piexif.helper.UserCommentEncode(metadata.description);
            }

            if (metadata.people && metadata.people.length > 0) {
                const peopleString = metadata.people.join(', ');
                exifDict["0th"][piexif.ImageIFD.Artist] = peopleString;
                exifDict["0th"][piexif.ImageIFD.XPAuthor] = peopleString;
                exifDict["0th"][piexif.ImageIFD.XPKeywords] = peopleString;
            }

            exifDict["0th"][piexif.ImageIFD.Software] = "Altema";

            exifDict["0th"][piexif.ImageIFD.DateTime] = new Date().toISOString().replace('T', ' ').substring(0, 19);

            const copyrightInfo = `Ancestry Media ID: ${metadata.mediaId}${metadata.treeName ? ` | Tree: ${metadata.treeName}` : ''}`;
            exifDict["0th"][piexif.ImageIFD.Copyright] = copyrightInfo;

            console.log(`EXIF data prepared:`, exifDict);

            const exifBytes = piexif.dump(exifDict);

            const newImageBinary = piexif.insert(exifBytes, binary);

            const newBlob = new Blob([newImageBinary], { type: imageBlob.type || 'image/jpeg' });

            console.log(`EXIF metadata embedded successfully`);
            return newBlob;

        } catch (error) {
            console.error(`⚠️ Error embedding EXIF metadata:`, error);
            console.log(`Falling back to original image without EXIF`);
            return imageBlob;
        }
    }

    function sanitizeFilename(filename) {
        if (!filename) return '';

        return filename
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^\w.-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 100);
    }

    function findAllThumbnails() {
        const thumbnailImages = document.querySelectorAll('img[src*="thumbnail"]');
        const thumbnails = [];

        thumbnailImages.forEach((img, index) => {
            const src = img.src;
            if (src && src.includes('ancestry.com') && src.includes('thumbnail')) {
                thumbnails.push({
                    element: img,
                    url: src,
                    index: index
                });
            }
        });

        return thumbnails;
    }

    function extractMediaIdsFromThumbnails(thumbnails) {
        const mediaIds = [];
        const seenIds = new Set();

        thumbnails.forEach((thumbnail, index) => {
            const mediaId = extractMediaIdFromUrl(thumbnail.url);
            if (mediaId && !seenIds.has(mediaId)) {
                seenIds.add(mediaId);
                mediaIds.push({
                    mediaId: mediaId,
                    thumbnailUrl: thumbnail.url,
                    thumbnailElement: thumbnail.element
                });
            }
        });

        return mediaIds;
    }

    function extractMediaIdFromUrl(url) {
        const match = url.match(/\/media\/([a-f0-9-]{36})/i);
        return match ? match[1] : null;
    }

    function generateFullSizeUrls(thumbnailUrl, mediaId) {
        const match = thumbnailUrl.match(/\/thumbnail\/namespaces\/(\d+)\/media\/([a-f0-9-]{36})/i);
        if (!match) return [];

        const namespace = match[1];

        return [
            {
                type: 'ancestry-api',
                url: `https://www.ancestry.com/api/media/retrieval/v2/image/namespaces/${namespace}/media/${mediaId}`
            },
            {
                type: 'large-thumbnail',
                url: `https://www.ancestry.com/api/media/retrieval/v2/thumbnail/namespaces/${namespace}/media/${mediaId}.jpg?client=trees-mediaservice&MaxSide=2000`
            },
            {
                type: 'mediasvc',
                url: `https://mediasvc.ancestry.com/v2/image/namespaces/${namespace}/media/${mediaId}`
            }
        ];
    }

    function cleanPersonName(name) {
        if (!name || typeof name !== 'string') return '';

        name = name.replace(/\s+/g, ' ').trim();
        name = name.replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '');
        name = name.replace(/\s+(Jr\.?|Sr\.?|III?|IV)$/i, '');
        name = name.replace(/\s*\([^)]*\)$/g, '');
        name = name.replace(/\s+/g, ' ').trim();

        if (name.length < 3 || name.length > 50) return '';

        const words = name.split(' ');
        if (words.length < 2) return '';

        const allCapitalized = words.every(word => word.length > 0 && /^[A-Z]/.test(word));
        if (!allCapitalized) return '';

        if (!/^[A-Za-z\s.-]+$/.test(name)) return '';

        return name;
    }

    function makeSafeFolderName(personName) {
        if (!personName) return 'Unknown_Person';

        let safeName = personName
            .replace(/\s+/g, '_')
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        if (safeName.length > 50) {
            safeName = safeName.substring(0, 50);
        }

        return safeName || 'Unknown_Person';
    }

    function updateStatus(title, detail) {
        if (statusDisplay) {
            statusDisplay.textContent = title;
        }
        if (detailDisplay) {
            detailDisplay.textContent = detail;
        }
    }

    function updateDetailStatus(detail) {
        if (detailDisplay) {
            detailDisplay.textContent = detail;
        }
    }

    function updateAutoLoadStats() {
        const thumbnails = findAllThumbnails();
        autoLoadStats.currentThumbnails = thumbnails.length;

        if (document.getElementById('thumbnail-count')) {
            document.getElementById('thumbnail-count').textContent = autoLoadStats.currentThumbnails;
        }

        mediaCollection.stats.totalFound = autoLoadStats.currentThumbnails;
        updateStatsDisplay();

        return thumbnails;
    }

    function updateStatsDisplay() {
        if (document.getElementById('media-count')) {
            const elements = {
                'thumbnail-count': autoLoadStats.currentThumbnails,
                'media-count': mediaCollection.mediaItems.size,
                'people-count': mediaCollection.stats.peopleFound,
                'download-count': mediaCollection.stats.downloads
            };

            Object.entries(elements).forEach(([id, newValue]) => {
                const element = document.getElementById(id);
                if (element) {
                    const oldValue = parseInt(element.textContent) || 0;
                    if (newValue !== oldValue) {
                        element.textContent = newValue;

                        element.classList.add('updated');
                        setTimeout(() => {
                            element.classList.remove('updated');
                        }, 600);
                    }
                }
            });
        }
    }

    function showReport() {
        const mediaItems = Array.from(mediaCollection.mediaItems.values());
        const withPeople = mediaItems.filter(item => item.people && item.people.length > 0);
        const withoutPeople = mediaItems.filter(item => !item.people || item.people.length === 0);
        const multiPerson = mediaItems.filter(item => item.people && item.people.length > 1);
        const withDescriptions = mediaItems.filter(item => item.description || item.title);

        const peopleCount = {};
        withPeople.forEach(item => {
            if (item.people) {
                item.people.forEach(person => {
                    peopleCount[person] = (peopleCount[person] || 0) + 1;
                });
            }
        });

        const topPeople = Object.entries(peopleCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([person, count]) => `• ${person}: ${count} images`)
            .join('\n');

        const gedStatus = mediaCollection.gedDownloaded ? 'Downloaded' : 'Not downloaded';
        const treeName = mediaCollection.selectedTree?.name || 'Unknown';

        const report = `
ALTEMA MEDIA HARVEST REPORT

Tree Information:
• Selected Tree: ${treeName}
• Tree ID: ${mediaCollection.selectedTree?.id || 'Unknown'}
• GED File: ${gedStatus} (APIs currently unavailable)

Auto-Loading Results:
• Thumbnails Found: ${autoLoadStats.currentThumbnails}
• Scroll Attempts: ${autoLoadStats.scrollAttempts}
• Load More Clicks: ${autoLoadStats.loadMoreClicks}

Multi-Threading Results:
• Threads Used: ${maxConcurrentThreads} parallel threads
• Total Analyzed: ${mediaItems.length}
• With People: ${withPeople.length}
• Multi-Person: ${multiPerson.length}
• Unknown People: ${withoutPeople.length}
• With Descriptions: ${withDescriptions.length}
• Downloaded: ${mediaCollection.stats.downloads}

Top People:
${topPeople || '• None yet'}

ALTEMA MEDIA PACKAGE STRUCTURE:
${treeName}_media_YYYY-MM-DD.zip
└── ancestry_media/
    ├── John_Smith/
    │   ├── original_photo_name.jpg ← EXIF embedded
    │   └── family_portrait.jpg ← EXIF embedded
    ├── Mary_Smith/
    │   └── [images with EXIF metadata]
    └── Unknown_People/
        └── [unidentified images with EXIF metadata]

GED FILES: For family tree data, use Ancestry's manual export feature
in your tree settings. Altema focuses on comprehensive media backup.

RESULT: Complete ancestry media backup ready for any genealogy software!
        `;

        alert(report);
    }

    function clearCollection() {
        if (confirm('Clear all data? This cannot be undone.')) {
            mediaCollection.mediaItems.clear();
            mediaCollection.stats = { converted: 0, peopleFound: 0, downloads: 0, totalFound: 0, loaded: 0 };
            mediaCollection.gedDownloaded = false;
            autoLoadStats = {
                currentThumbnails: 0,
                lastThumbnailCount: 0,
                stableCount: 0,
                scrollAttempts: 0,
                maxScrollAttempts: 60,
                loadMoreClicks: 0
            };
            threadProgress = [];
            activeThreads = 0;

            updateStatsDisplay();
            updateAutoLoadStats();
            updateGEDStatus(false, 'GED file not downloaded');
            hideThreadProgress();
            updateStatus('Cleared', 'All data cleared. Ready for new scan.');
        }
    }

    window.addEventListener('beforeunload', () => {
        if (thumbnailObserver) {
            thumbnailObserver.disconnect();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHarvester);
    } else {
        initHarvester();
    }

})();

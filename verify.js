let uploadedImage = null;
let uploadedJSON = null;

document.addEventListener('DOMContentLoaded', () => {
    setupDropZones();
    setupVerifyButton();
});

function setupDropZones() {
    const imageDropZone = document.getElementById('imageDropZone');
    const imageInput = document.getElementById('imageInput');
    
    imageDropZone.addEventListener('click', () => imageInput.click());
    imageDropZone.addEventListener('dragover', handleDragOver);
    imageDropZone.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('active'));
    imageDropZone.addEventListener('drop', (e) => handleDrop(e, 'image'));
    imageInput.addEventListener('change', (e) => handleFileSelect(e, 'image'));

    const jsonDropZone = document.getElementById('jsonDropZone');
    const jsonInput = document.getElementById('jsonInput');
    
    jsonDropZone.addEventListener('click', () => jsonInput.click());
    jsonDropZone.addEventListener('dragover', handleDragOver);
    jsonDropZone.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('active'));
    jsonDropZone.addEventListener('drop', (e) => handleDrop(e, 'json'));
    jsonInput.addEventListener('change', (e) => handleFileSelect(e, 'json'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('active');
}

function handleDrop(e, type) {
    e.preventDefault();
    e.currentTarget.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0], type);
}

function handleFileSelect(e, type) {
    const files = e.target.files;
    if (files.length > 0) processFile(files[0], type);
}

function processFile(file, type) {
    if (type === 'image') {
        if (!file.type.startsWith('image/')) {
            showError('Please upload a valid image file');
            return;
        }
        
        uploadedImage = file;
        document.getElementById('imageInfo').textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        document.getElementById('imageInfo').classList.add('show');
        checkReadyToVerify();
        
    } else if (type === 'json') {
        if (!file.name.endsWith('.json')) {
            showError('Please upload a valid JSON file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                uploadedJSON = JSON.parse(e.target.result);
                document.getElementById('jsonInfo').textContent = `✓ ${file.name} - ID: ${uploadedJSON.imageId}`;
                document.getElementById('jsonInfo').classList.add('show');
                checkReadyToVerify();
            } catch (error) {
                showError('Invalid JSON file format: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
}

function checkReadyToVerify() {
    if (uploadedImage && uploadedJSON) {
        document.getElementById('verifyButton').disabled = false;
    }
}

function setupVerifyButton() {
    document.getElementById('verifyButton').addEventListener('click', startVerification);
}

async function startVerification() {
    document.getElementById('errorMessage').classList.remove('show');
    document.getElementById('resultContainer').classList.remove('show');
    document.getElementById('loading').classList.add('show');
    
    try {
        console.log('Starting verification...');
        console.log('Expected dimensions:', uploadedJSON.width, 'x', uploadedJSON.height);
        console.log('Image ID:', uploadedJSON.imageId);
        
        // Load image and handle EXIF orientation
        const canvas = await loadImageWithEXIF(uploadedImage, uploadedJSON.width, uploadedJSON.height);
        
        console.log('Image loaded and oriented:', canvas.width, 'x', canvas.height);
        
        // Test random number generator
        console.log('\n=== Testing Random Number Generator ===');
        const testRandom = createJavaRandom(uploadedJSON.imageId);
        const h1_y_test = Math.floor(testRandom() * (canvas.height / 3));
        const h2_y_test = Math.floor(canvas.height / 2 + testRandom() * (canvas.height / 3));
        console.log('Generated H positions:', h1_y_test, h2_y_test);
        console.log('Expected from JSON:', uploadedJSON.strands[0].yPosition, uploadedJSON.strands[1].yPosition);
        console.log('Match:', h1_y_test === uploadedJSON.strands[0].yPosition && h2_y_test === uploadedJSON.strands[1].yPosition);
        
        // Extract fingerprint
        const extractedData = await extractImageFingerprint(canvas, uploadedJSON.imageId);
        
        // Compare with JSON
        const results = compareFingerprints(extractedData, uploadedJSON);
        
        // Display results
        displayResults(results);
        
    } catch (error) {
        console.error('Verification error:', error);
        showError('Verification failed: ' + error.message);
    } finally {
        document.getElementById('loading').classList.remove('show');
    }
}

function loadImageWithEXIF(file, expectedWidth, expectedHeight) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                EXIF.getData(img, function() {
                    const orientation = EXIF.getTag(this, "Orientation") || 1;
                    
                    console.log('EXIF Orientation:', orientation);
                    console.log('Raw image dimensions:', img.width, 'x', img.height);
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    
                    if (orientation === 6 || orientation === 8) {
                        canvas.width = img.height;
                        canvas.height = img.width;
                    } else {
                        canvas.width = img.width;
                        canvas.height = img.height;
                    }
                    
                    switch(orientation) {
                        case 1:
                            ctx.drawImage(img, 0, 0);
                            console.log('Applied: No rotation');
                            break;
                        case 3:
                            ctx.translate(canvas.width, canvas.height);
                            ctx.rotate(Math.PI);
                            ctx.drawImage(img, 0, 0);
                            console.log('Applied: 180° rotation');
                            break;
                        case 6:
                            ctx.translate(canvas.width, 0);
                            ctx.rotate(Math.PI / 2);
                            ctx.drawImage(img, 0, 0);
                            console.log('Applied: 90° CW rotation');
                            break;
                        case 8:
                            ctx.translate(0, canvas.height);
                            ctx.rotate(-Math.PI / 2);
                            ctx.drawImage(img, 0, 0);
                            console.log('Applied: 270° CW rotation');
                            break;
                        default:
                            ctx.drawImage(img, 0, 0);
                    }
                    
                    console.log('Final canvas dimensions:', canvas.width, 'x', canvas.height);
                    
                    if (canvas.width === expectedWidth && canvas.height === expectedHeight) {
                        console.log('✓ Dimensions match!');
                        resolve(canvas);
                    } else {
                        reject(new Error(`Dimension mismatch! Expected ${expectedWidth}x${expectedHeight}, got ${canvas.width}x${canvas.height}`));
                    }
                });
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

async function extractImageFingerprint(canvas, imageId) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    
    console.log('\nExtracting fingerprint...');
    
    const random = createJavaRandom(imageId);
    const fingerprint = { strands: [], edges: {} };
    
    // Extract horizontal strands (2) - MATCH ANDROID EXACTLY
    const h1_y = Math.floor(random() * (height / 3));
    const h2_y = Math.floor(height / 2 + random() * (height / 3));
    
    console.log('Horizontal strand positions:', h1_y, h2_y);
    console.log('Expected:', uploadedJSON.strands[0].yPosition, uploadedJSON.strands[1].yPosition);
    
    fingerprint.strands.push(await extractHorizontalStrand(ctx, width, height, 1, h1_y));
    fingerprint.strands.push(await extractHorizontalStrand(ctx, width, height, 2, h2_y));
    
    // Extract vertical strands (2)
    const v1_x = Math.floor(random() * (width / 3));
    const v2_x = Math.floor(width / 2 + random() * (width / 3));
    
    console.log('Vertical strand positions:', v1_x, v2_x);
    console.log('Expected:', uploadedJSON.strands[2].xPosition, uploadedJSON.strands[3].xPosition);
    
    fingerprint.strands.push(await extractVerticalStrand(ctx, width, height, 3, v1_x));
    fingerprint.strands.push(await extractVerticalStrand(ctx, width, height, 4, v2_x));
    
    // Extract diagonal strands (2)
    const d1_startX = Math.floor(random() * (width / 4));
    const d1_startY = Math.floor(random() * (height / 4));
    fingerprint.strands.push(await extractDiagonalStrand(ctx, width, height, 5, d1_startX, d1_startY, true));
    
    const d2_startX = Math.floor(width - random() * (width / 4) - 1);
    const d2_startY = Math.floor(random() * (height / 4));
    fingerprint.strands.push(await extractDiagonalStrand(ctx, width, height, 6, d2_startX, d2_startY, false));
    
    console.log('Diagonal strand positions:', `(${d1_startX},${d1_startY})`, `(${d2_startX},${d2_startY})`);
    console.log('Expected:', `(${uploadedJSON.strands[4].startX},${uploadedJSON.strands[4].startY})`, `(${uploadedJSON.strands[5].startX},${uploadedJSON.strands[5].startY})`);
    
    // Extract edges
    fingerprint.edges = await extractEdges(ctx, width, height);
    
    return fingerprint;
}

// CORRECTED Java Random implementation
function createJavaRandom(seed) {
    // Java: seed = (seed ^ 0x5DEECE66DL) & ((1L << 48) - 1)
    let state = (BigInt(seed) ^ BigInt(0x5DEECE66D)) & ((BigInt(1) << BigInt(48)) - BigInt(1));
    
    const multiplier = BigInt(0x5DEECE66D);
    const addend = BigInt(0xB);
    const mask = (BigInt(1) << BigInt(48)) - BigInt(1);
    
    // Java's next(bits) method
    function next(bits) {
        state = (state * multiplier + addend) & mask;
        return Number(state >> BigInt(48 - bits));
    }
    
    // Java's nextInt() equivalent
    return function() {
        // Java nextInt() returns: next(31)
        // To get double 0-1: we need to match Android's random() * (height/3) behavior
        // Java Random.nextInt(n) does: next(31) % n if n is power of 2, else rejection sampling
        // For our purposes, matching nextInt() directly:
        const val = next(31);
        return val / 0x7fffffff; // 2^31 - 1
    };
}

async function extractHorizontalStrand(ctx, width, height, id, y) {
    const imageData = ctx.getImageData(0, y, width, 1);
    const pixels = imageData.data;
    
    let pixelString = '';
    for (let x = 0; x < width; x++) {
        const idx = x * 4;
        pixelString += rgbToHex(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
    }
    
    const hash = await sha256(pixelString);
    console.log(`Strand ${id} (H) hash:`, hash.substring(0, 16) + '...');
    
    return { id, type: 'HORIZONTAL', yPosition: y, sha256: hash };
}

async function extractVerticalStrand(ctx, width, height, id, x) {
    const imageData = ctx.getImageData(x, 0, 1, height);
    const pixels = imageData.data;
    
    let pixelString = '';
    for (let y = 0; y < height; y++) {
        const idx = y * 4;
        pixelString += rgbToHex(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
    }
    
    const hash = await sha256(pixelString);
    console.log(`Strand ${id} (V) hash:`, hash.substring(0, 16) + '...');
    
    return { id, type: 'VERTICAL', xPosition: x, sha256: hash };
}

async function extractDiagonalStrand(ctx, width, height, id, startX, startY, tlbr) {
    let pixelString = '', x = startX, y = startY, count = 0;
    
    while (x >= 0 && x < width && y >= 0 && y < height) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        pixelString += rgbToHex(px[0], px[1], px[2]);
        x = tlbr ? x + 1 : x - 1;
        y++;
        count++;
    }
    
    const hash = await sha256(pixelString);
    console.log(`Strand ${id} (D) hash:`, hash.substring(0, 16) + '...', `(${count} pixels)`);
    
    return { id, type: tlbr ? 'DIAGONAL_TL_BR' : 'DIAGONAL_TR_BL', sha256: hash, pixelCount: count };
}

async function extractEdges(ctx, width, height) {
    const rate = 50;
    let top = '', bottom = '', left = '', right = '';
    
    for (let x = 0; x < width; x += rate) {
        const t = ctx.getImageData(x, 0, 1, 1).data;
        const b = ctx.getImageData(x, height - 1, 1, 1).data;
        top += rgbToHex(t[0], t[1], t[2]);
        bottom += rgbToHex(b[0], b[1], b[2]);
    }
    
    for (let y = 0; y < height; y += rate) {
        const l = ctx.getImageData(0, y, 1, 1).data;
        const r = ctx.getImageData(width - 1, y, 1, 1).data;
        left += rgbToHex(l[0], l[1], l[2]);
        right += rgbToHex(r[0], r[1], r[2]);
    }
    
    return {
        topHash: await sha256(top),
        bottomHash: await sha256(bottom),
        leftHash: await sha256(left),
        rightHash: await sha256(right),
        edgeHash: await sha256(top + bottom + left + right)
    };
}

function compareFingerprints(extracted, original) {
    console.log('\n=== Comparing Fingerprints ===');
    
    const results = { strands: [], edges: {}, overallMatch: 0 };
    let matchCount = 0, totalChecks = 0;
    
    for (let i = 0; i < extracted.strands.length; i++) {
        const ex = extracted.strands[i];
        const or = original.strands.find(s => s.id === ex.id);
        const match = ex.sha256.toLowerCase() === or.sha256.toLowerCase();
        
        console.log(`Strand ${ex.id} (${ex.type}): ${match ? '✓ MATCH' : '✗ MISMATCH'}`);
        if (!match) {
            console.log(`  Extracted: ${ex.sha256.substring(0, 20)}...`);
            console.log(`  Original:  ${or.sha256.substring(0, 20)}...`);
        }
        
        results.strands.push({ id: ex.id, type: ex.type, match });
        if (match) matchCount++;
        totalChecks++;
    }
    
    console.log('\n=== Edge Comparison ===');
    results.edges.top = extracted.edges.topHash.toLowerCase() === original.edges.topHash.toLowerCase();
    results.edges.bottom = extracted.edges.bottomHash.toLowerCase() === original.edges.bottomHash.toLowerCase();
    results.edges.left = extracted.edges.leftHash.toLowerCase() === original.edges.leftHash.toLowerCase();
    results.edges.right = extracted.edges.rightHash.toLowerCase() === original.edges.rightHash.toLowerCase();
    
    console.log(`Top: ${results.edges.top ? '✓' : '✗'} | Bottom: ${results.edges.bottom ? '✓' : '✗'} | Left: ${results.edges.left ? '✓' : '✗'} | Right: ${results.edges.right ? '✓' : '✗'}`);
    
    if (results.edges.top) matchCount++;
    if (results.edges.bottom) matchCount++;
    if (results.edges.left) matchCount++;
    if (results.edges.right) matchCount++;
    totalChecks += 4;
    
    results.overallMatch = Math.round((matchCount / totalChecks) * 100);
    console.log(`\n=== OVERALL: ${matchCount}/${totalChecks} matches (${results.overallMatch}%) ===\n`);
    
    return results;
}

function displayResults(results) {
    document.getElementById('resultContainer').classList.add('show');
    
    const pct = results.overallMatch;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressFill').textContent = pct + '%';
    
    const pf = document.getElementById('progressFill');
    if (pct === 100) pf.style.background = 'linear-gradient(90deg, #4CAF50 0%, #8BC34A 100%)';
    else if (pct >= 70) pf.style.background = 'linear-gradient(90deg, #FF9800 0%, #FFC107 100%)';
    else pf.style.background = 'linear-gradient(90deg, #F44336 0%, #E91E63 100%)';
    
    let icon, title, subtitle;
    if (pct === 100) {
        icon = '✅'; title = 'Authentic & Unmodified'; subtitle = 'Perfect match';
    } else if (pct >= 70) {
        icon = '⚠️'; title = 'Likely Authentic'; subtitle = 'Minor discrepancies';
    } else if (pct >= 40) {
        icon = '⚠️'; title = 'Partially Modified'; subtitle = 'Altered or cropped';
    } else {
        icon = '❌'; title = 'Verification Failed'; subtitle = 'Does not match';
    }
    
    document.getElementById('resultIcon').textContent = icon;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSubtitle').textContent = subtitle;
    
    document.getElementById('overallMatch').innerHTML = getStatusBadge(pct + '%', pct);
    
    const hM = results.strands.filter(s => s.type === 'HORIZONTAL' && s.match).length;
    document.getElementById('horizontalMatch').innerHTML = getStatusBadge(`${hM}/2`, hM === 2 ? 100 : 0);
    
    const vM = results.strands.filter(s => s.type === 'VERTICAL' && s.match).length;
    document.getElementById('verticalMatch').innerHTML = getStatusBadge(`${vM}/2`, vM === 2 ? 100 : 0);
    
    const dM = results.strands.filter(s => s.type.startsWith('DIAGONAL') && s.match).length;
    document.getElementById('diagonalMatch').innerHTML = getStatusBadge(`${dM}/2`, dM === 2 ? 100 : 0);
    
    const eM = Object.values(results.edges).filter(e => e).length;
    document.getElementById('edgeMatch').innerHTML = getStatusBadge(`${eM}/4`, eM === 4 ? 100 : 0);
    
    document.getElementById('fingerprintMatch').innerHTML = getStatusBadge(pct === 100 ? 'Match' : 'Mismatch', pct === 100 ? 100 : 0);
}

function getStatusBadge(text, score) {
    const c = score === 100 ? 'status-pass' : score >= 50 ? 'status-partial' : 'status-fail';
    return `<span class="status-badge ${c}">${text}</span>`;
}

function showError(msg) {
    document.getElementById('errorMessage').textContent = '⚠️ ' + msg;
    document.getElementById('errorMessage').classList.add('show');
}

function rgbToHex(r, g, b) {
    return ('0' + r.toString(16)).slice(-2).toUpperCase() + 
           ('0' + g.toString(16)).slice(-2).toUpperCase() + 
           ('0' + b.toString(16)).slice(-2).toUpperCase();
}

async function sha256(msg) {
    const buf = new TextEncoder().encode(msg);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
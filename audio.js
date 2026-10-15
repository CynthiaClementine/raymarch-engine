var atx;
var aud_bufTargets = [
	`resources/contrapunctus.mp3	contrapunctus`,
	`resources/brown-noise.mp3		nBrown`,
	`resources/click-10hz.mp3		geiger`,
];
var aud_airSpeed = 5;				//speed of sound in units / ms
var aud_antiAliasing = 20;			//number of frames to gather "current" audio data from
var aud_maxDelay = 60 * frameTime;	//max. audio delay in ms
var aud_masterGain = 0.03;
var aud_numRays = 60;

var aud_currID = 0xFACE101;
var aud_currTabs = [];
var aud_bufs = {};
var aud_gSources = [];
var aud_gGainers = [];
var aud_gWarpers = [];
var aud_gDelays = [[], []];
var aud_gPanners = [];
var aud_nullNode;



/**
 * assigns a sound (stored in one of the bufs) to a world object and starts playing it.
 * This puts an AudioBufferSourceNode in the object's .sound property.
 * @param {Scene3dObject} obj the object to assign the sound to.
 * @param {String} soundID the sound's ID. This is a key in `aud_bufs`.
 */
function assignSound(obj, soundID) {
	const source = new AudioBufferSourceNode(atx, {buffer: aud_bufs[soundID]});
	source.uid = (aud_currID++).toString(32);
	obj.sound = source;
	//if the source isn't connected, it'll pause 
	source.connect(aud_nullNode);
	source.start();
}


function constructAudioGraph(soundTab) {
	//first make sure to disconnect everything
	aud_gSources.forEach(n => {
		n.disconnect();
		n.connect(aud_nullNode);
	});
	[...aud_gGainers, ...aud_gWarpers, ...(aud_gDelays[0]), ...(aud_gDelays[1])].forEach(n => {
		n.disconnect();
	});
	var newGSources = [];
	var usedGainers = 0;
	var usedWarpers = 0;
	var usedDelays = [0, 0];

	//connect channels if required (should only happen once)
	if (aud_gPanners.length < 2) {
		console.log(`CONNECTING PANNERS`);
		aGraphChoose(aud_gPanners, 0, `pan`).pan.value = -1;
		aGraphChoose(aud_gPanners, 1, `pan`).pan.value = 1;
		aud_gPanners[0].connect(atx.destination);
		aud_gPanners[1].connect(atx.destination);
	}

	soundTab.forEach(s => {
		//register the AudioBufferSourceNode in the graph
		const absN = s[1];
		const cID = s[3];
		if (!newGSources.includes(absN)) {
			newGSources.push(absN);
		}

		absN.connect(atx.destination);

		//hook it up to a gain + delay
		const gainN = aGraphChoose(aud_gGainers, usedGainers++, `gain`);
		const delayN = aGraphChoose(aud_gDelays[cID], usedDelays[cID]++, `delay`);

		gainN.gain.value = s[2] * aud_masterGain;
		delayN.delayTime.value = s[0] / 100;

		//connect up to the whole graph
		absN.connect(gainN);
		gainN.connect(delayN);
		delayN.connect(aud_gPanners[cID]);
	});

	//allow sources that aren't part of the graph to be garbage collected
	aud_gSources = newGSources;
	
	// var aud_gGainers = [];
	// var aud_gWarpers = [];
	// var aud_gDelays = [[], []];
}

/**
 * pick out the selected node from the list. If one doesn't exist, create a specified node.
 * @param {AudioNode[]} nodeArr
 * @param {Integer} ind index of the array to choose
 * @param {`gain`|`delay`|`warp`|`pan`} nodeType custom enum of node type
 * @returns {AudioNode}
*/
function aGraphChoose(nodeArr, ind, nodeType) {
	if (nodeArr[ind]) {
		return nodeArr[ind];
	}
	var newNode;
	switch (nodeType) {
		case `gain`:
		default:
			newNode = new GainNode(atx, {gain: 1});
			break;
		case `delay`:
			//maxDelayTime sets the size of the internal buffer. A larger maxDelayTime means more memory usage
			newNode = new DelayNode(atx, {delayTime: 0, maxDelayTime: aud_maxDelay / 1000});
			break;
		case `warp`:
			break;
		case `pan`:
			newNode = new StereoPannerNode(atx, {pan: 0});
			break;
	}

	nodeArr[ind] = newNode;
	return newNode;
}


function audioRaycast() {
	var leftEarSounds = [];
	var rightEarSounds = [];

	var rayObj = new Ray_Sonic(camera.world, camera.pos, [0,0,0], aud_maxDelay * aud_airSpeed);

	//[xHat[0], xHat[1], xHat[2], yHat[0]...]
	var cMat = camera.matrix();

	//choose a random direction
	for (var a=0; a<aud_numRays; a+=2) {
		audioRaycastSingle(rayObj, cMat, leftEarSounds, -1, 0.1);
	}

	for (var b=0; b<aud_numRays; b+=2) {
		audioRaycastSingle(rayObj, cMat, rightEarSounds, -0.1, 1);
	}

	return [leftEarSounds, rightEarSounds];
}


function audioRaycastSingle(rayObj, cMat, soundArr, minX, maxX) {
	const randDir = normalize([randomBounded(minX, maxX), randomBounded(-1, 1), randomBounded(-1, 1)]);
	const dVec = [
		randDir[0]*cMat[0] + randDir[1]*cMat[3] + randDir[2]*cMat[6],
		randDir[0]*cMat[1] + randDir[1]*cMat[4] + randDir[2]*cMat[7],
		randDir[0]*cMat[2] + randDir[1]*cMat[5] + randDir[2]*cMat[8],
	];

	rayObj.reset(camera.world, camera.pos, dVec);
	rayObj.iterate();
	if (rayObj.sound) {
		addAudioEntry(soundArr, Math.round(0.1 * rayObj.distance / aud_airSpeed), rayObj.sound, 1);
	}
}

/**
 * the sound array is ordered by delay, with 0 delay at the start and max delay at the end.
 * Each entry in the sound array is `[delay, soundRef, amplitude]`. However, soundRefs should be unique for a given delay.
 * This function makes sure everything is inserted correctly.
 * @param {Array} soundArr the array to insert into
 * @param {Integer} delayCS the audio's delay, in centiseconds. I quantize to this because you can't really hear <1 centisecond of delay
 * @param {Number} amplitude the gain of the audio
 * @param {0|1|undefined} channelID optional: the ID of the channel this sound belongs to.
 */
function addAudioEntry(soundArr, delayCS, soundRef, amplitude, channelID) {
	var entry = [delayCS, soundRef, amplitude];
	if (channelID != undefined) {
		entry[3] = channelID;
	}
	for (var a=0; a<soundArr.length; a++) {
		if (soundArr[a][0] < delayCS) {
			continue;
		}
		if (soundArr[a][0] > delayCS) {
			soundArr.splice(a, 0, entry);
			return;
		}
		//equal delay: matches sound?
		if (soundArr[a][1] == soundRef) {
			soundArr[a][2] += amplitude;
			return;
		}
		continue;
	}
	soundArr.push(entry);
}

function setupAudio() {
	aud_currTabs.ind = 0;
	atx = new AudioContext();

	//loop through all bufTargets and start making them into bufs
	var needToLoad = aud_bufTargets.length;
	
	for (var t=0; t<aud_bufTargets.length; t++) {
		const spl = aud_bufTargets[t].split(`\t`);
		const [fileName, bufName] = [spl[0], spl[spl.length-1]];

		//async:
		var f = fetch(fileName).then(async (res) => {
			aud_bufs[bufName] = await atx.decodeAudioData(await res.arrayBuffer());
			needToLoad -= 1;
			if (needToLoad <= 0) {
				console.log(`all audio loaded!`);
			} else {
				console.log(`audio: ${needToLoad} tracks left`);
			}
		});
	}

	aud_nullNode = new GainNode(atx, {gain: 0});
	aud_nullNode.connect(atx.destination);
}

function tickAudio() {
	var soundTab = audioRaycast();
	aud_currTabs[aud_currTabs.ind] = soundTab;
	aud_currTabs.ind = (aud_currTabs.ind + 1) % aud_antiAliasing;

	//merge all currTabs together into the "actually current" table
	var currLeft = [];
	var currRight = [];
	var soundTab = [];
	for (var i=0; i<aud_currTabs.length; i++) {
		for (var l=0; l<aud_currTabs[i][0].length; l++) {
			addAudioEntry(currLeft, aud_currTabs[i][0][l][0], aud_currTabs[i][0][l][1], aud_currTabs[i][0][l][2], 0);
		}
		for (var r=0; r<aud_currTabs[i][1].length; r++) {
			addAudioEntry(currRight, aud_currTabs[i][1][r][0], aud_currTabs[i][1][r][1], aud_currTabs[i][1][r][2], 1);
		}
	}

	//the two separate arrays were useful when constructing / merging sounds.
	//less useful now, as two separate objects we have to apply the same steps to.
	//merging them now solves this
	soundTab = [...currLeft, ...currRight];
	soundTab.length = currLeft.length + currRight.length;
	for (var a=0; a<currLeft.length; a++) {
		soundTab[a] = currLeft[a];
	}
	
	for (var b=0,a=currLeft.length; b<currRight.length; a++,b++) {
		soundTab[a] = currRight[b];
	}

	debug_soundTab = soundTab;
	
	constructAudioGraph(soundTab);
}
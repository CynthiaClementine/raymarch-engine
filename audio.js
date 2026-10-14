var atx;
var aud_out;
var aud_osc;
var aud_bufTargets = [
	`resources/contrapunctus.mp3	contrapunctus`,
	`resources/brown-noise.mp3		nBrown`,
];
var aud_currID = 0xFACE101;
var aud_bufs = {};
var aud_gSources = [];
var aud_gGainers = [];
var aud_gWarpers = [];
var aud_gDelays = [[], []];
var aud_gPanners = [];

var aud_airSpeed = 10;				//speed of sound in units / ms
var aud_maxDelay = 60 * frameTime;	//max. audio delay in ms
var aud_masterGain = 0.05;


function setupAudio() {
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

	//example source
	aud_osc = atx.createOscillator();
	aud_osc.type = `sine`;
	aud_osc.frequency.value = 440;

	//example gain node
	var aGain = atx.createGain();
	aGain.gain.value = 0.5;

	//example pan node
	

	//output node
	aud_out = atx.destination;


	//buffer -> gain -> output
	aud_osc.connect(aud_out);
	// aGain.connect(aud_out);
}

function startAudio() {
	atx.resume();
	aud_osc.start();
}


/**
 * assigns a sound (stored in one of the bufs) to a world object and starts playing it.
 * This puts an AudioBufferSourceNode in the object's .sound property.
 * @param {Scene3dObject} obj the object to assign the sound to.
 * @param {String} soundID the sound's ID. Acts as a key in `aud_bufs`.
 */
function assignSound(obj, soundID) {
	const source = new AudioBufferSourceNode(atx, {buffer: aud_bufs[soundID]});
	source.uid = (aud_currID++).toString(32);
	obj.sound = source;
	source.start();
}


function constructAudioGraph(leftEarSounds, rightEarSounds) {
	//the two separate arrays were useful when constructing / merging sounds
	//less useful as two separate objects we have to do the same thing to.
	//merging them now solves this
	var sounds = [];
	sounds.length = leftEarSounds.length + rightEarSounds.length;
	for (var a=0; a<leftEarSounds.length; a++) {
		leftEarSounds[a][3] = 0;
		sounds[a] = leftEarSounds[a];
	}
	
	for (var b=0,a=leftEarSounds.length; b<rightEarSounds.length; a++,b++) {
		rightEarSounds[b][3] = 1;
		sounds[a] = rightEarSounds[b];
	}

	//first make sure to disconnect everything
	[...aud_gSources, ...aud_gGainers, ...aud_gWarpers, ...(aud_gDelays[0]), ...(aud_gDelays[1])].forEach(n => {
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

	sounds.forEach(s => {
		//register the AudioBufferSourceNode in the graph
		const absN = s[1];
		if (!newGSources.includes(absN)) {
			newGSources.push(absN);
		}

		//hook it up to a gain + delay
		const gainN = aGraphChoose(aud_gGainers, usedGainers++, `gain`);
		
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
	var nRays = 100;
	var leftEarSounds = [];
	var rightEarSounds = [];

	var soundsArr = [];

	var rayObj = new Ray_Sonic(camera.world, camera.pos, [0,0,0], aud_maxDelay * aud_airSpeed);

	//[xHat[0], xHat[1], xHat[2], yHat[0]...]
	var cMat = camera.matrix();

	//choose a random direction
	for (var a=0; a<nRays; a+=2) {
		audioRaycastSingle(rayObj, cMat, soundsArr, -1, 0.1);
	}

	for (var b=0; b<nRays; b+=2) {
		audioRaycastSingle(rayObj, cMat, soundsArr, -0.1, 1);
	}

	return soundsArr;
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
	console.log(rayObj.pos, rayObj.distance, rayObj.sound);
	if (rayObj.sound) {
		//delay is measured in centiseconds because that's what I'm quantizing to. 
		//Any closer together than that and it basically sounds the same. whatever.
		var delayCS = Math.round(0.1 * rayObj.distance / aud_airSpeed);
		var soundRef = rayObj.sound;
		var ampl = 1;
		//sound array is ordered by delay, with 0 delay at the start and max delay at the end. 
		//each entry in the sound array is [delay, soundRef, amplitude]
		for (var a=0; a<soundArr.length; a++) {
			if (soundArr[a][0] < delayCS) {
				continue;
			}
			if (soundArr[a][0] > delayCS) {
				soundArr.splice(a, 0, [delayCS, soundRef, ampl]);
				return;
			}
			//equal delay: matches sound?
			if (soundArr[a][1] == soundRef) {
				soundArr[a][2] += ampl;
				return;
			}
			continue;
		}
		soundArr.push([delayCS, soundRef, ampl]);
	}
}
/*general math / void functions for utility

INDEX

aabbInside(minPos1, maxPos1, minPos2, maxPos2)
applyDist(oldDist, testDist, nature, gloopiness, smoothness)
	benchmark(pxMult)
bounds_expandU(bounds, extraDist)
bounds_expand(bounds, extraDists)
boundsAngle(radians)
boundsForList(objectList)
BVHUnion(node1, node2)
calcLine(xDir, yDir, zDir, x, pixelWidth, pixelHeight)
calcScreenPos(worldPos)
constrainPlayer(xRange, yRange, zRange)
copyArr(source, dest)
drawPixelArt(pxData, startX, startY, pxSize)
drawGhostDot(screenPos, color)
drawUI()
drawLine(x, colorArr)
flipLine(obj)
getDistance(x1, y1, z1, x2, y2, z2)
getDistancePos(pos1, pos2)


getDistance(x1, y1, z1, x2, y2, z2)
getDistancePos(pos1, pos2)

projectPanini(x, pixelsInX, y, pixelsInY)
projectPerspective(x, pixelsInX, y, pixelsInY)
projectOct(x, pixelsInX, y, pixelsInY)

sceneSDF(sceneCollection, pos)


*/

//determines if aabb2 is completely inside aabb1
function aabbInside(minPos1, maxPos1, minPos2, maxPos2) {
	return  (minPos1[0] <= minPos2[0]) && (maxPos1[0] >= maxPos2[0]) && 
			(minPos1[1] <= minPos2[1]) && (maxPos1[1] >= maxPos2[1]) && 
			(minPos1[2] <= minPos2[2]) && (maxPos1[2] >= maxPos2[2]);
}

/**
* returns an updated signed distance based on an old/new distance and an object's nature.
 */
function applyDist(oldDist, testDist, nature, gloopiness, smoothness) {
	if (nature & N_SMOOTH) {
		testDist -= smoothness;
	}
	if (nature & N_FOG || nature & N_GRAVITY) {
		testDist = Math.max(testDist, ray_nearDist * 0.9);
	}
	if (nature & N_ANTI) {
		return Math.max(-testDist, oldDist);
	}
	if (nature & N_GLOOP) {
		var res = Math.min(smoothMin(oldDist, testDist, gloopiness / 2), oldDist);
		if (nature & N_FOG && res < 0) {
			console.log(oldDist, testDist, res);
		}
		return res;
	}
	return Math.min(testDist, oldDist);
}

function benchmark(pxMult) {
	const tMult = 4000;
	var score = 0;
	var miniscores = [];
	var f = 0;
	const startSpot = {
		pos: [...(player.pos), loading_world.name],
		rot: [player.theta, player.phi],
		fov: camera_FOV,
		px: render_n
	};

	loadSpot(benchmark_locs[0], pxMult);

	//after 3 seconds of each benchmark spot, record the average time taken. This contributes to the score
	for (f=1; f<benchmark_locs.length; f++) {
		const trueF = f;
		window.setTimeout(() => {
			miniscores.push(+(debugTA.innerHTML));
			score += +(debugTA.innerHTML);
			loadSpot(benchmark_locs[trueF], pxMult);
		}, tMult*trueF);
	}

	//at the end of it all, lower score is better
	window.setTimeout(() => {
		miniscores.push(+(debugTA.innerHTML));
		score += +(debugTA.innerHTML);
		console.log(`benchmark finished! Times are [${miniscores.map(a => Math.round(a))}].\nTotal Score is [${Math.round(score)}].`);
		loadSpot(startSpot);
	}, tMult*f);
}

function bounds_expandU(bounds, extraDist) {
	decrementS(bounds[0], extraDist);
	incrementS(bounds[1], extraDist);
	return bounds;
}

function bounds_expand(bounds, extraDists) {
	decrement(bounds[0], extraDists);
	increment(bounds[1], extraDists);
	return bounds;
}

//gives the "bounds angle" - the angle between 0 and pi/2 that acts the same as the given angle for bounding boxes.
function boundsAngle(radians) {
	if (radians >= Math.PI) {
		radians -= Math.PI;
	}
	if (radians < Math.PI / 2) {
		return radians;
	}
	return Math.PI - radians;
}

/**
* takes in an array of Scene3dObjects and calculates a bounding box that encompasses all the objects (by taking the min of all mins and max of all maxs)
* @param {Scene3dObject[]} objectList the list to calculate for
* @returns {Number[]} an array in the format `[minPos, maxPos]`
 */
function boundsForList(objectList) {
	var min = [1e1001, 1e1001, 1e1001];
	var max = [-1e101, -1e101, -1e101];
	objectList.forEach(o => {
		if (!o) {
			throw new Error(`Bounds Error: undefined object!`);
		}
		var bounds = o.bounds();
		for (var a=0; a<=2; a++) {
			min[a] = Math.min(min[a], bounds[0][a]);
			max[a] = Math.max(max[a], bounds[1][a]);
			if (Number.isNaN(bounds[0][a])) {
				console.error(bounds, o);
				throw new Error(`Bounds Error: bounds aren't calculated correctly!`);
			}
			if (Number.isNaN(min[a])) {
				throw new Error(`Bounds Error: what`);
			}
		}
	});
	return [min, max];
}

function BVHUnion(node1, node2) {
	const minPos = Pos(
		Math.min(node1.minPos[0], node2.minPos[0]),
		Math.min(node1.minPos[1], node2.minPos[1]),
		Math.min(node1.minPos[2], node2.minPos[2]),
	);
	
	const maxPos = Pos(
		Math.max(node1.maxPos[0], node2.maxPos[0]),
		Math.max(node1.maxPos[1], node2.maxPos[1]),
		Math.max(node1.maxPos[2], node2.maxPos[2]),
	);
	
	return new BVH_Node(minPos, maxPos, null, node1, node2);
}

function calcLine(xDir, yDir, zDir, x, pixelWidth, pixelHeight) {
	var r = new Ray_Tracking(camera.world, camera.pos, [0, 1, 0]);
	//array of integers, measuring RGB/RGB/RGB/RGB
	const targetSize = pixelHeight * 3;
	var colors;
	if (lineBuffer_num > -1 && lineBuffers[lineBuffer_num].length == targetSize) {
		colors = lineBuffers[lineBuffer_num--];
	} else {
		colors = new Uint8Array(targetSize);
	}
	
	
	for (var y=0; y<pixelHeight; y++) {
		const [xMult, yMult, zMult] = camera_projFunc(x, pixelWidth, pixelHeight - y, pixelHeight);
		//create a ray and iterate until complete
		trueDir = [
			xDir[0] * xMult + yDir[0] * yMult + zDir[0] * zMult,
			xDir[1] * xMult + yDir[1] * yMult + zDir[1] * zMult,
			xDir[2] * xMult + yDir[2] * yMult + zDir[2] * zMult
		];
		/*assuming that the camera's dirs are all normalized:
		the magnitude of the trueDir will always be
		sqrt(x^2 + y^2 + z^2)
		sqrt((xMult+yMult+zMult)^2 + (xMult+yMult+zMult)^2 + (xMult+yMult+zMult)^2)
		sqrt(3 * (xMult+yMult+zMult)^2)
		*/
		var xyzMult = xMult + yMult + zMult;
		// var magnitude = Math.sqrt(3 * xyzMult * xyzMult);
		var magnitude = Math.hypot(trueDir[0], trueDir[1], trueDir[2]);
		trueDir[0] /= magnitude;
		trueDir[1] /= magnitude;
		trueDir[2] /= magnitude;
		r.reset(camera.world, camera.pos, trueDir);
		var c = r.iterate();
		if (r.object) {
			colors[3*y] = 255;
			// colors[3*y+1] = c[1];
			// colors[3*y+2] = c[2];
		}
	}
	return colors;
}

/**
 * @param {Pos} worldPos - the position in the world to calculate the screen position of
 * @return {Number[]|null} the screen position as [x, y], or null if the position is behind the camera
 */
function calcScreenPos(worldPos) {
	if (!worldPos || Number.isNaN(worldPos[0] + worldPos[1] + worldPos[2])) {
		return null;
	}
	//first, find the offset of the world pos from the camera in the camera's coordinate system.
	var relPos = transformInverse(worldPos, camera.pos, camera.quat);
	if (relPos[2] <= 0) {
		return null;
	}

	// oughhhh fov
	var halfHeight = Math.tan(camera_FOV * degToRad / 2);
	var halfWidth = halfHeight * (banvas.width / banvas.height);
	var normalizedX = (relPos[0] / relPos[2]) / halfWidth;
	var normalizedY = (relPos[1] / relPos[2]) / halfHeight;

	return [0.5*(normalizedX + 1) * banvas.width, (1 - 0.5*(normalizedY + 1)) * banvas.height];
}

function constrainPlayer(xRange, yRange, zRange) {
	player.pos[0] = modulate(player.pos[0] + xRange, 2 * xRange) - xRange;
	player.pos[1] = modulate(player.pos[1] + yRange, 2 * yRange) - yRange;
	player.pos[2] = modulate(player.pos[2] + zRange, 2 * zRange) - zRange;
}

/**
 * puts all the components of source into dest. Useful for copying arrays of numbers without reference issues.
 * @returns {Number[]} dest
 */
function copyArr(source, dest) {
	for (var g=0; g<source.length; g++) {
		dest[g] = source[g];
	}
	return dest;
}

/**
* uses the pxdata to draw 16-color pixel art onto the banvas. 
* @param {Number[]} pxData an array of integers. Each integer represents one line of the art. Individual pixels are represented by a chunk of 4 bits.
* @param {Number} startX the X coordinate of the banvas to start on
* @param {Number} startY the Y coordinate of the banvas to start on
* @param {Number} pxSize how large each pixel of the pixel art should be displayed at
 */
function drawPixelArt(pxData, startX, startY, pxSize) {
	var pxWidth = pxData.w * pxSize;
	var pxHeight = pxData.h * pxSize;
	
	for (var y=0; y<pxData.h; y++) {
		const dat = pxData[y];
		for (var x=0; x<pxData.w; x++) {
			const ind = dat >> (4 * (pxData.w - x - 1)) & 0xF;
			btx.fillStyle = colors16[ind];
			btx.fillRect(startX + x * pxSize, startY + y * pxSize, pxSize + 0.5, pxSize + 0.5);
		}
	}
}

function drawGhostDot(screenPos, color) {
	if (!screenPos) {
		return;
	}
	const alphaSave = btx.globalAlpha;
	btx.globalAlpha = 1;
	btx.lineWidth = 1;
	btx.strokeStyle = color;
	btx.beginPath();
	btx.arc(...screenPos, 6, 0, Math.PI * 2);
	btx.stroke();
	btx.globalAlpha = alphaSave;
}

function drawUI() {
	const cvs = banvas;
	const cw = cvs.width;
	const ch = cvs.height;
	const pxW = cw / render_n;
	const pxH = ch / render_n;
	var center = [cvs.width / 2, cvs.height / 2];
	const crossLen = (render_n < 100) ? (1 / render_n) : 0.04;
	
	//crosshair
	btx.globalAlpha = 0.3;
	btx.beginPath();
	btx.strokeStyle = color_editor_border;
	btx.lineWidth = Math.ceil(ch * (1.5 / render_n));
	btx.moveTo(center[0] - ch * crossLen, center[1]);
	btx.lineTo(center[0] + ch * crossLen, center[1]);
	btx.moveTo(center[0], center[1] - ch * crossLen);
	btx.lineTo(center[0], center[1] + ch * crossLen);
	btx.stroke();
	
	//collision
	if (debug_flags.collisionRaycast) {
		const pixelsInX = render_colN;
		const pixelsInY = render_colN;
		const c = camera.basis();
		
		for (var x=0; x<pixelsInX; x++) {
			drawLine(x, calcLine(c.right, c.up, c.forward, x, pixelsInX, pixelsInY));
		}
	}
	
	if (!debug_listening) {
		btx.globalAlpha = 1;
		return;
	}
	
	//debug bars
	btx.fillStyle = editor.stable ? color_editor_border : `#F99`;
	btx.fillRect(0, 0, cvs.width, pxH * 12);
	btx.fillRect(0, ch - pxH * 12, cvs.width, pxH * 12);

	if (editor.axisType) {
		drawEditorGizmo();
	}
	
	//selected object ghost
	if (editor.selected != player) {
		var ghostPos = calcScreenPos(editor.selected.pos);
		var holrPos = calcScreenPos(transform([0, 0, 20], editor.selected.pos, editor.holr));
		var rotPos = calcScreenPos(transform([0, 0, 20], editor.selected.pos, editor.selected.quat));
		drawGhostDot(ghostPos, colors16[15]);
		drawGhostDot(holrPos, colors16[14]);
		drawGhostDot(rotPos, colors16[13]);
	}
	
	//global/local indicator
	btx.globalAlpha = 0.6;
	drawPixelArt(editor.local ? pxdata_box : pxdata_world, 4 * pxW, 16 * pxH, pxW * 4);
	btx.globalAlpha = 1;
}

function drawLine(x, colorArr) {
	//writing directly to imageData is theoretically faster than changing fillStyle a bunch
	var blockSizeTrue = (banvas.width / render_colN);
	var blockSize = Math.round(banvas.width / render_colN);
	var imageData = btx.createImageData(blockSize, banvas.height);
	var dataBlock = imageData.data;
	for (var y=0; y<render_colN; y++) {
		var r = colorArr[3*y];
		for (var yOff=0; yOff<blockSize; yOff++) {
			var lineInd = 4 * blockSize * (y * blockSize + yOff);
			for (var xOff=0; xOff<blockSize; xOff++) {
				var pixelInd = lineInd + (4 * xOff);
				if (r) {
				dataBlock[pixelInd] = r;
				dataBlock[pixelInd+3] = r / 2;
				}
			}
		}
	}
	
	btx.putImageData(imageData, x * blockSizeTrue, 0);
	render_linesDrawn += 1;
}

function flipLine(obj) {
	//build startPos and endPos as absolute coordinates
	var startPos = copyArr(obj.pos, []);
	var endPos = copyArr(obj.pos, []);
	increment(endPos, obj.offP);

	//flip, write back
	[startPos, endPos] = [endPos, startPos];
	
	decrement(endPos, startPos);
	copyArr(startPos, obj.pos);
	copyArr(endPos, obj.offP);
}

function getDistance(x1, y1, z1, x2, y2, z2) {
	const dx = x1 - x2;
	const dy = y1 - y2;
	const dz = z1 - z2;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getDistancePos(pos1, pos2) {
	const dx = pos1[0] - pos2[0];
	const dy = pos1[1] - pos2[1];
	const dz = pos1[2] - pos2[2];
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function bounds_gen(pos, rx, ry, rz, quat) {
	const abs = Math.abs;
	const xVec = quatRotate([rx, 0, 0], quat);
	const yVec = quatRotate([0, ry, 0], quat);
	const zVec = quatRotate([0, 0, rz], quat);
	
	//since a cube gives every combination of ±vec, it's possible to just decompose the vectors and take the min / max variance
	const bestX = (abs(xVec[0]) + abs(yVec[0]) + abs(zVec[0]));
	const bestY = (abs(xVec[1]) + abs(yVec[1]) + abs(zVec[1]));
	const bestZ = (abs(xVec[2]) + abs(yVec[2]) + abs(zVec[2]));

	return [
		Pos(pos[0] - bestX, pos[1] - bestY, pos[2] - bestZ),
		Pos(pos[0] + bestX, pos[1] + bestY, pos[2] + bestZ),
	];
}

//tests whether the keys in dictionary A and B are the same
function keyDiff(dictA, dictB) {
	var s = new Set();
	var opp = new Set();
	const aKeys = Object.keys(dictA);
	const bKeys = Object.keys(dictB);
	
	if (aKeys.length != bKeys.length) {
		return false;
	}
	
	aKeys.forEach(k => {
		s.add(k);
	});
	
	for (var z=0; z<bKeys.length; z++) {
		if (!s.delete(bKeys[z])) {
			opp.add(bKeys[z]);
		}
		if (dictB[bKeys[z]] == -1) {
			delete dictB[bKeys[z]];
		}
	}

	opp.forEach(e => {
		s.add(e);
	});
	
	return s;
}


/**
 * puts the player, camera, and `loading_world` into a new world.
 * @param {String} worldName
 */
function loadWorld(worldName) {
	var obj = worlds[worldName];
	if (!obj) {
		console.error(`invalid world name!`);
		return;
	}
	player.world = obj;
	camera.world = obj;
	loading_world = obj;
}

/**
 * a spotObj has `pos`, `rot`, `fov`, and `px` fields. Pos is the position with the world name tacked on.
 */
function loadSpot(spotObj, pxMult) {
	loadWorld(spotObj.pos[3]);
	
	player.pos = Pos(...(spotObj.pos));
	player.theta = spotObj.rot[0];
	player.phi = spotObj.rot[1];
	
	camera_FOV = spotObj.fov;
	render_goalN = spotObj.px * (pxMult ?? 1);
}

/**
 * takes in rotations in radians and packages them all into a single 32-bit integer. Quantizes them by degrees as well.
 * @param {Number} theta 
 * @param {Number} phi 
 * @param {Number} rot 
 * @returns {Integer} 
 */
function packageRot(theta, phi, rot) {
	// theta modulate()
	var deg = (a) => {
		return Math.round(a / degToRad);
	};
	theta = modulate(deg(theta), 360);
	phi = deg(phi) + 90;
	rot = modulate(deg(rot), 360);
	buf32_int[0] = ((theta & 0x1FF) << 0) | ((phi & 0x1FF) << 9) | ((rot & 0x1FF) << 18);
	return buf32_float[0];
}

/**
* takes in two 3d vectors and returns the projection of a onto b
* @param {Number[]} a the first 3d vector
* @param {Number[]} b the direction to project to
 */
function proj(a, b) {
	const ab = dot(a, b);
	const bb = dot(b, b);
	const mult = ab / bb;
	//proj = v(u•v / v•v)
	return [b[0] * mult, b[1] * mult, b[2] * mult];
}

/**
 * performs the Forward And Backward Reaching Inverse Kinematic algorithm,
 * given an array of vectors (relative Pos[] starting at 0,0) points the vectors to a specified end point.
 * @param {Pos[]} vectorSet
 * @param {Pos} targetPoint
 * @param {Integer} iterations
 */
function fabrik(vectorSet, targetPoint, iterations) {
	//	1. mark A and B
	//	2. pull end of chain to B
	//		trace backwards for all S
	//		S end = B
	//		S start points from S start -> B
	//	3. pull start of chain to A
	//	4. repeat 2, 3

	//STEP 1: setup
	//in this case start is always [0,0,0] and all vectors are RELATIVE. So that makes it.. simpler?
	var endSet = [[...vectorSet[0]]];
	var lenSet = [Math.hypot(...vectorSet[0])];

	for (var g=1; g<vectorSet.length; g++) {
		lenSet[g] = magnitude(vectorSet[g]);
		endSet[g] = v3_add(endSet[g-1], vectorSet[g]);
	}

	for (var w=0; w<iterations; w++) {
		//STEP 2: pull vectors to end
		endSet[vectorSet.length-1] = targetPoint;
		for (var g=vectorSet.length-1; g>0; g--) {
			//L = norm(B-A)
			var pointVec = normalize(v3_sub(endSet[g], endSet[g-1]));
			//A = B - L*l
			endSet[g-1][0] = endSet[g][0] - pointVec[0] * lenSet[g];
			endSet[g-1][1] = endSet[g][1] - pointVec[1] * lenSet[g];
			endSet[g-1][2] = endSet[g][2] - pointVec[2] * lenSet[g];
		}
	
		//STEP 3: pull vectors to start
		endSet[-1] = [0,0,0];
		for (var g=0; g<vectorSet.length; g++) {
			//L = norm(B - A)
			var pointVec = normalize(v3_sub(endSet[g], endSet[g-1]));
			//B = A + L*l
			endSet[g][0] = endSet[g-1][0] + pointVec[0] * lenSet[g]
			endSet[g][1] = endSet[g-1][1] + pointVec[1] * lenSet[g]
			endSet[g][2] = endSet[g-1][2] + pointVec[2] * lenSet[g]
		}
	}

	//STEP 4: un-setup
	var finals = [];
	for (var h=0; h<vectorSet.length; h++) {
		finals[h] = v3_sub(endSet[h], endSet[h-1]);
	}

	return finals;
}


//TODO: remove this and put in the fragment shader, where it's actually useful

//https://www.researchgate.net/publication/354065227_Essential_Ray_Generation_Shaders

//pixel ray essentially starts behind the camera, from the back of the panini circle.
function projectPanini(x, pixelsInX, y, pixelsInY) {
	var screenDist = (camera_paniniR); //1 + camera_paniniR ?
	var halfPixX = pixelsInX / 2;
	var halfPixY = pixelsInY / 2;

	var maxOffsetX = (camera_halfTan * screenDist);
	
	var screenX = maxOffsetX * (x - halfPixX) / halfPixX;
	var screenY = camera_halfTanVert * (y - halfPixY) / halfPixY;
	
	var paniniAngle = Math.atan(screenX / screenDist);
		/*
		2 * paniniFOV = regular FOV
		x = (1+panini) * tan(2*maxPaniniFOV)
		atan(x / (1+panini)) = 4 * regularFOV
		atan(x / (1+panini)) / 4 = regularFOV */
	var [z, x] = polToXY(0, 0, paniniAngle * 2, 1);
	return [
		x,
		screenY,
		z
	];
}

//pixel ray starts at camera point and intersects regular intervals on a plane 1 unit in front
function projectPerspective(x, pixelsInX, y, pixelsInY) {
	var singleOffset = (camera_halfTan / (pixelsInX / 2));
	return [
		singleOffset * (x - (pixelsInX / 2)),
		singleOffset * (y - (pixelsInY / 2)),
		1
	];
}

function projectOct(x, pixelsInX, y, pixelsInY) {
	var halfPixX = pixelsInX / 2;
	var halfPixY = pixelsInY / 2;
	x = (x - halfPixX) / halfPixX;
	y = (y - halfPixY) / halfPixY;
	var n = [
		x,
		y,
		1 - Math.abs(x) - Math.abs(y)
	];
	var t = Math.min(n[2], 0);
	n[0] += (n[0] > 0 ? -t : t);
	n[1] += (n[1] > 0 ? -t : t);
	return n;
}

function noise(x, y) {
	var i = [Math.floor(x), Math.floor(y)];
	var f = [x - Math.floor(x), y - Math.floor(y)];
	f = [
		f[0] * f[0] * (3 - 2 * f[0]),
		f[1] * f[1] * (3 - 2 * f[1]),
	];
	
	//bilinear interpolation on the corners
	return linterp( linterp(randStable(i[0], i[1]),            randStable(i[0]+1, i[1]), f[0]),
					linterp(randStable(i[0], i[1]+1), randStable(i[0]+1, i[1]+1), f[0]), f[1]);
}

function mortonCalc(pos, lowestPos, highestPos) {
	const mortonRange = (2 ** 10) - 1;
	
	const xRange = highestPos[0] - lowestPos[0];
	const yRange = highestPos[1] - lowestPos[1];
	const zRange = highestPos[2] - lowestPos[2];
	
	//normalize all coordinates
	var x = (pos[0] - lowestPos[0]) / xRange;
	var y = (pos[1] - lowestPos[1]) / yRange;
	var z = (pos[2] - lowestPos[2]) / zRange;
	
	x = (x * mortonRange) | 0;
	y = (y * mortonRange) | 0;
	z = (z * mortonRange) | 0;
	
	return mortonInterleave(x, y, z);
}

function mortonInterleave(x, y, z) {
	return mortonSwizzle(x) | (mortonSwizzle(y) << 1) | (mortonSwizzle(z) << 2);
}

function mortonSort(objsList) {
	//takes in a list of objects [obj1, obj2, obj3..] 
	//and returns a list of objects [obj3, obj1, obj2...] sorted by their morton code. Since we're just constructing a BVH
	//it doesn't really matter whether it sorts high - low or low - high.
	var sortList = objsList.map((a) => {
		const bounds = a.bounds();
		return [a, mortonCalc(a, bounds[0], bounds[1])];
	});
	
	sortList.sort((a, b) => {
		return a[1] - b[1];
	});
	
	return sortList.map(a => a[0]);
}

function mortonSwizzle(x) {
	x = (x * 0x00010001) & 0xFF0000FF;
	x = (x * 0x00000101) & 0x0F00F00F;
	x = (x * 0x00000011) & 0xC30C30C3;
	x = (x * 0x00000005) & 0x49249249;
	return x;
}

/**
 * like modulate, but half the range is in the negatives. 
 * Computed as `x - n * round(x / n)`
 */
function modulateSigned(x, num) {
	return x - num * Math.round(x / num);
}

function modulateSoft(x, num) {
	if (x >= num) {
		x -= num;
	}
	if (x < 0) {
		x += num;
	}
	return x;
}

function normalizeTo(vector, length) {
	var norm = normalize(vector);
	norm[0] *= length;
	norm[1] *= length;
	norm[2] *= length;
	return norm;
}

function perf_logStart(logName) {
	perf_log[logName].push(performance.now());
}

function perf_logEnd(logName) {
	const n = perf_log[logName].length - 1;
	var past = perf_log[logName][n];
	if (!past) {
		return;
	}
	var present = performance.now();
	perf_log[logName][n] = present - past;
	if (n > perf_len) {
		perf_log[logName].splice(0, 1);
	}
	return (present - past);
}

function prand(min, max, seedBuf) {
	seedBuf[0] |= 0;
	seedBuf[0] = seedBuf[0] + 0x9e3779b9 | 0;
	let t = seedBuf[0] ^ seedBuf[0] >>> 16;
	t = Math.imul(t, 0x21f0aaad);
	t = t ^ t >>> 15;
	t = Math.imul(t, 0x735a2d97);
	return min + (((t = t ^ t >>> 15) >>> 0) / 4294967296) * (max - min);
}

function printPos(pos) {
	const n = 3;
	return `(${pos[0].toFixed(n)},${pos[1].toFixed(n)},${pos[2].toFixed(n)})`;
}

function randStable(p0, p1) {
	const b0 = p0 * 0.3183099 + 0.71;
	const b1 = p1 * 0.3183099 + 0.113;
	p0 = 50 * (b0 - Math.floor(b0));
	p1 = 50 * (b1 - Math.floor(b1));
	const q = p0 * p1 * (p0 + p1);
	return 2 * (q - Math.floor(q)) - 1;
}

function rotate3d(p, theta, phi, rot) {
	[p[0], p[2]] = rotate(p[0], p[2], -theta);
	[p[1], p[2]] = rotate(p[1], p[2],  phi);
	[p[0], p[1]] = rotate(p[0], p[1],  -rot);
	return p;
}

/**
 * gives the squared distance to a segment, from point p.
 */
function segmentDist2(seg, p) {
	const t = clamp(dot(seg, p) / dot(seg, seg), 0, 1);
	const proj = [p[0] - seg[0]*t, p[1] - seg[1]*t, p[2] - seg[2]*t];
	return dot(proj, proj);
}

function snapToGrid(num) {
	return round(num, editor.gridDist);
}

/**
 * Returns the image of a given point when transformed by the given offset / angles
 * @param {Number[]} point the point to transform
 * @param {Number[]} offset the Pos to transform by
 * @param {Number[]} quat quaternion to use for the transformation
 */
function transform(point, offset, quat) {
	point = quatRotate(point, quat);
	increment(point, offset);
	return point;
}

/**
 * transforms a standard transform. In this case, the first 4 args are the transform to modify, and the last 4 args are the base to apply.
 * @param {Pos} pos
 * @param {Number[]} quat
 * @param {Pos} basePos
 * @param {Number[]} baseQuat
 * @returns {{pos: Number, quat: Number[]}}
 */
function transformTransform(pos, quat, basePos, baseQuat) {
	//rotate, then translate
	pos = quatRotate(pos, baseQuat);
	quat = quatMultiply(quat, baseQuat);

	pos = Pos(pos[0] + basePos[0], pos[1] + basePos[1], pos[2] + basePos[2]);
	
	return {
		pos: pos,
		quat: normalize(quat),
	};
}

/**
 * Returns the pre-image of a given point under the given offset / angles
 * @param {Number[]} point the point to transform
 * @param {Number[]} offset the Pos to transform by
 * @param {Number[]} rotation quaternion
 */
function transformInverse(point, offset, quat) {
	return quatUnrotate(v3_sub(point, offset), quat);
}

/**
 * gives the SDF of a specified set of objects (considered the Scene.)
 * @param {Scene3dObject[]} sceneCollection array of objects to check against
 * @param {Pos} pos position to check
 * @returns {[]} `[closestDist, closestObj]`
 */
function sceneSDF(sceneCollection, pos) {
	var dist = 1e1001;
	var distObj = undefined;
	var testDist;
	sceneCollection.forEach(o => {
		testDist = o.distanceToPos(pos);
		testDist = applyDist(dist, testDist, o.nature, o.gloopiness, o.smoothness);
		if (testDist != dist) {
			dist = testDist;
			distObj = o;
		}
	});
	return [dist, distObj];
}

function sdfTri(relX, relY, w, h) {
	h *= 2;
	relX = Math.abs(relX);
	relY += h/2;

	const buf1 = clamp((relX*w + relY*h) / (w*w + h*h), 0, 1);

	const ax = relX - w * buf1;
	const ay = relY - h * buf1;

	const bx = relX - w * clamp(relX / w, 0, 1);
	const by = relY - h;
	const k = Math.sign(h);
	const d = Math.min(ax*ax + ay*ay, bx*bx + by*by);
	const s = Math.max(k*(relX*h - relY*w), k*(relY - h));
	return Math.sqrt(d) * Math.sign(s) - 0.1;
}

function serializeRot(theta, phi, rot) {
	phi += pi/2;
	theta /= degToRad;
	phi /= degToRad;
	rot /= degToRad;
	theta = modulate(Math.round(theta), 360);
	phi = modulate(Math.round(phi), 360);
	rot = modulate(Math.round(rot), 360);

	var res = `${theta}~${phi}~${rot}`;
	return (res == `0~90~0`) ? `R` : res;
}

function serializeNat(nature, gloop, smooth, ex, ey, ez) {
	const r = Math.round;

	if (nature & N_EXTRUDE) {
		return `${nature}.${2*gloop}.${2*smooth}.${r(10*ex)}.${r(10*ey)}.${r(10*ez)}`;
	}
	if ((nature & N_GLOOP && gloop != 0.5) || (nature & N_SMOOTH && smooth != 0.5)) {
		nature = `${nature}.${2*gloop}.${2*smooth}`;
	}
	return `${nature}`;
}

function trueObj(object) {
	while (object.parent) {
		object = object.parent;
	}
	return object;
}

function updateFOV(newFOV) {
	camera_FOV = newFOV;
	//first figure out best function given the FOV
	switch (true) {
		case (newFOV <= 120):
			camera_projFunc = projectPerspective;
			camera_halfTan = Math.tan((camera_FOV / 2) * degToRad);
			break;
		case (newFOV <= 180):
			//handle panini FOV:
			//panini FOVs are different. Because it's stereographic projection, basically, degrees are doubled. 
			//90 paniniº are worth 180 traditionalº. 
			//For parity with traditional projection, "newFOV" will correspond to the regular degrees.
			//But it's more useful to store the paniniº.
			var vertFOV = Math.min((newFOV / 2), 90);
			camera_halfTan = Math.tan((camera_FOV / 4) * degToRad);
			//in this case, vertical FOV will be less than horizontal FOV
			camera_halfTanVert = Math.tan((vertFOV / 2) * degToRad);
			break;
	}
}



//objects that are required for the engine to run
class Ray_Tracking {
	/**
	* a Tracking Ray is a ray intended to calculate the distance to the nearest object in a given direction.
	* Once it hits something, it returns the total distance traveled.
	* Tracking Rays also keep track of which object they've hit.
	* @param {World} world the world the ray's in
	* @param {Float32Array[]} pos starting position of the ray
	* @param {Float32Array[]} dPos direction vector to travel in
	* @param {Number} maxDist the maximum distance to travel before stopping
	* @param {Number} minDist the minimum distance at which a collision counts
	*/
	constructor(world, pos, dPos, maxDist, minDist, excludeObj) {
		this.world = world;
		this.pos = new Float32Array(pos);
		this.dPos = dPos;
		this.distance = 0;
		this.distCap = maxDist ?? ray_maxDist;
		this.minDist = minDist ?? ray_minDist;
		this.objsList = [];
		this.objsExclude = excludeObj;
		this.object = null;
		this.calcObjs();
	}
	
	reset(world, pos, dPos) {
		this.world = world;
		this.pos = new Float32Array(pos);
		this.dPos = dPos;
		this.distance = 0;
		this.calcObjs();
		this.object = null;
	}
	
	calcObjs() {
		this.objsList = this.world.bvh.objects(this).filter(a => !a.unselectable);
	}

	iterate() {
		const minDist = this.minDist;
		var iters = 0;
		if (!this.objsList.length || this.objsList.length == 0) {
			return;
		}
		
		while (iters < ray_maxIters) {
			//get distance
			const distObj = sceneSDF(this.objsList, this.pos)[1];
			if (!distObj) {
				this.distance = this.distCap;
				return this.distCap;
			}
			var dist = distObj.distanceToPos(this.pos);
			dist = applyDist(1e1001, dist, distObj.nature, distObj.gloopiness, distObj.smoothness);
			
			//if distance is out of dist bounds
			if (dist < minDist) {
				this.object = distObj;
				return this.distance;
			}
			
			if (dist < ray_nearDist) {
				distObj.material.applyNearEffect(this);
			}
			
			dist = Math.min(dist, this.distCap - this.distance);
			
			//move distance
			increment(this.pos, v3_mulS(this.dPos, dist));
			this.distance += dist;
			
			//if we've reached the cap, return
			if (this.distance >= this.distCap) {
				return this.distCap;
			}
			iters += 1;
		}
		return this.distance;
	}
}

// class Ray_Sonic {
// 	/**
// 	* a Sonic Ray bounces through the scene and stops when it's hit a sound-producing object.
// 	* Similarly to a tracking ray, keeps track of both total distance and object hit. Will bounce off of non-sonic objects.
// 	* Tracking Rays also keep track of which object they've hit.
// 	* @param {World} world the world the ray's in
// 	* @param {Float32Array[]} pos starting position of the ray
// 	* @param {Float32Array[]} dPos direction vector to travel in
// 	* @param {Number} maxDist the maximum distance to travel before stopping
// 	*/
// 	constructor(world, pos, dPos, maxDist, minDist, power) {
// 		this.world = world;
// 		this.pos = new Float32Array(pos);
// 		this.dPos = dPos;
// 		this.distance = 0;
// 		this.distCap = maxDist ?? ray_maxDist;
// 		this.minDist = ray_minDist;
// 		this.objsList = [];
// 		this.object = null;
// 		this.calcObjs();
// 	}
	
// 	reset(world, pos, dPos) {
// 		this.world = world;
// 		this.pos = new Float32Array(pos);
// 		this.dPos = dPos;
// 		this.distance = 0;
// 		this.calcObjs();
// 		this.object = null;
// 	}
	
// 	calcObjs() {
// 		this.objsList = this.world.bvh.objects(this).filter(a => !a.intangible);
// 	}

// 	iterate() {
// 		const minDist = this.minDist;
// 		var iters = 0;
// 		if (!this.objsList.length || this.objsList.length == 0) {
// 			return;
// 		}
		
// 		while (iters < ray_maxIters) {
// 			//get distance
// 			const distObj = sceneSDF(this.objsList, this.pos)[1];
// 			if (!distObj) {
// 				this.distance = this.distCap;
// 				return this.distCap;
// 			}
// 			var dist = distObj.distanceToPos(this.pos);
// 			dist = applyDist(1e1001, dist, distObj.nature, distObj.gloopiness, distObj.smoothness);
			
// 			//if distance is out of dist bounds
// 			if (dist < minDist) {
// 				this.object = distObj;
// 				return this.distance;
// 			}
			
// 			if (dist < ray_nearDist) {
// 				distObj.material.applyNearEffect(this);
// 			}
			
// 			dist = Math.min(dist, this.distCap - this.distance);
			
// 			//move distance
// 			increment(this.pos, v3_mulS(this.dPos, dist));
// 			this.distance += dist;
			
// 			//if we've reached the cap, return
// 			if (this.distance >= this.distCap) {
// 				return this.distCap;
// 			}
// 			iters += 1;
// 		}
// 		return this.distance;
// 	}
// }



//BVH - Bounding Volume Hierarchy.
//a collection of rectangular nodes that contain either one object or two sub-nodes.
//used as a data structure that can speed up finding the closest object, while also fitting into a nice array that can go on the GPU
class BVH {
	constructor(world) {
		this.world = world;
		this.root = null;
	}
	
	generate() {
		if (this.world.expObjs.length == 0) {
			this.root = new BVH_Node(Pos(0, 0, 0), Pos(0, 0, 0), -1, null, null);
			return;
		}
		var sorted = mortonSort(this.world.expObjs);
		this.root = this.generateSubtree(sorted, 0, sorted.length - 1);
	}
	
	generateSubtree(list, startInd, endInd) {
		//leaf case
		if (startInd >= endInd) {
			const o = list[startInd];
			const bounds = o.bounds();
			if (Number.isNaN(bounds[0][0]) || Number.isNaN(bounds[0][1])) {
				throw new Error(`NaN bounds detected at object ${o.serialize()}!`);
			}
			return new BVH_Node(bounds[0], bounds[1], o, null, null);
		}
		
		//branch case
		const m = ((startInd + endInd) / 2) | 0;
		const left = this.generateSubtree(list, startInd, m);
		const right = this.generateSubtree(list, m + 1, endInd);
		return BVHUnion(left, right);
	}
	
	objectsInBox(minPos, maxPos) {
		var res = this.root.objectsInBox(minPos, maxPos);
		if (res.constructor.name == `Array`) {
			return res;
		}
		if (res.constructor.name == `Number`) {
			return [];
		}
		//it's an object of some sort
		return [res];
	}
	
	distance(obj) {
		return this.root.distance(obj.pos, obj.dPos);
	}
	
	objects(obj) {
		return this.root.objects(obj.pos, obj.dPos);
	}
}

class BVH_Node {
	constructor(minPos, maxPos, obj, left, right) {
		this.minPos = minPos;
		this.maxPos = maxPos;
		this.obj = obj;
		this.left = left;
		this.right = right;
	}
	
	distance(pos, dPos) {
		//if it's a leaf node
		if (this.obj != null) {
			return this.obj.distanceToPos(pos);
		}
		
		//no intersection, return huge distance
		if (!this.rayIntersects(pos, dPos)) {
			return 2 * ray_maxDist;
		}
		
		//yes intersection! Recurse to children
		var d1 = this.left.distance(pos, dPos);
		var d2 = this.right.distance(pos, dPos);
		console.log(`d1=${d1.toFixed(2)}, d2=${d2.toFixed(2)}`);
		return Math.min(d1, d2);
	}
	
	objects(pos, dPos) {
		if (this.obj != null) {
			return [this.obj];
		}
		
		if (!this.rayIntersects(pos, dPos)) {
			return [];
		}
		
		var d1 = this.left.objects(pos, dPos);
		var d2 = this.right.objects(pos, dPos);
		return d1.concat(d2);
	}
	
	rayIntersects(pos, dPos) {
		/*
		The Slab Method:
			p(t) = o + t•v
			if v = 0 ignore 
		
			tLow = (l - o) / v
			tHigh = (h - o) / v
			tClose = whichever's lesser (of tLow, tHigh)
			tFar = whichever's greater (of tLow, tHigh)
		
			tClose = max of tCloses
			tFar = min of tFars
		
			intersection exists only if tClose ≤ tFar
		 */
		var tClose = -1e1001;
		var tFar = 1e1001;
		
		var tLow, tHigh;
		for (var c=0; c<3; c++) {
			//I'm just not going to do error checking on the potential divides by 0. I hope the world will forgive me
			tLow = (this.minPos[c] - pos[c]) / dPos[c];
			tHigh = (this.maxPos[c] - pos[c]) / dPos[c];
			if (tLow > tHigh) {
				[tLow, tHigh] = [tHigh, tLow];
			}
			
			tClose = Math.max(tClose, tLow);
			tFar = Math.min(tFar, tHigh);
		}
		return (tClose <= tFar);
	}
	
	objectsInBox(minPos, maxPos) {
		//figure out if the box overlaps self's box
		var intersects = (minPos[0] < this.maxPos[0] && maxPos[0] > this.minPos[0])
						&& (minPos[1] < this.maxPos[1] && maxPos[1] > this.minPos[1])
						&& (minPos[2] < this.maxPos[2] && maxPos[2] > this.minPos[2]);
		
		if (!intersects) {
			return [];
		}
		if (this.obj) {
			return this.obj;
		}
		
		return [].concat(this.left.objectsInBox(minPos, maxPos)).concat(this.right.objectsInBox(minPos, maxPos));
	}
}


class PhysStruct {
	/**
	 * a PhysStruct is a structure that moves through the world and collides with objects. There is one main function that you can call (`physstep`)
	 * that will calculate the new coordinates after a physics step.
	 */
	constructor(world, pos, quat, rx, ry, rz, allowRotation, cMult, cMax, cDamp, cDist) {
		this.world = world;
		this.pos = pos;
		this.dPos = Pos(0,0,0);
		this.aPos = Pos(0,0,0);
		this.dMin = 0.04;
		this.dMax = 30;
		this.quat = quat ?? quatIdentity();
		this.allowRot = allowRotation;
		this.rx = rx;
		this.ry = ry;
		this.rz = rz;

		this.forces = [];
		this.colForces = [];

		this.colMult = cMult ?? 0.1;
		this.colMax = cMax ?? 1.3;
		this.colDamp = cDamp ?? 0.01;
		this.colDist = cDist ?? 2;
		this.mass = 1;
	}

	//gives all of the collision points in relative coordinates
	calcColPoints() {
		const w = this.rx;
		const h = this.ry;
		const l = this.rz;
		
		return [
			[0,0,0],
			[0, h, 0],
			[0, -h, 0],
			[-w, 0, 0],
			[w, 0, 0],
			[0, 0, l],
			[0, 0, -l],
		];
	}

	calcPossibleObjs() {
		const dMax = this.dMax;
		const ignore = this.ignore;
		this.possibleObjs = this.world.bvh.objectsInBox(v3_subS(this.pos, dMax), v3_addS(this.pos, dMax));
		this.portalObjs = [];
		for (var o=0; o<this.possibleObjs.length; o++) {
			var O = this.possibleObjs[o];
			if (O.intangible || trueObj(O) == ignore) {
				this.possibleObjs.splice(o, 1);
				o -= 1;
				continue;
			}
			if (O.material && O.material.type == M_PORTAL) {
				this.portalObjs.push(O)
				this.possibleObjs.splice(o, 1);
				o -= 1;
				continue;
			}
		}
	}

	//debug, usually not used but could be useful
	express() {
		var objs = [];
		const xHat = quatRotate([1, 0, 0], this.quat);
		const yHat = quatRotate([0, 1, 0], this.quat);
		const zHat = quatRotate([0, 0, 1], this.quat);
		const colObjs = this.possibleObjs;
		var colPoints = this.calcColPoints();
		//figure out what the points are
		
		//transform colPoints into world coordinates and calculate force
		for (var c=0; c<colPoints.length; c++) {
			//go through each point. It acts as a spring that's compressed based on the sceneDist
			var p = colPoints[c];
			p = [
				p[0]*xHat[0] + p[1]*yHat[0] + p[2]*zHat[0],
				p[0]*xHat[1] + p[1]*yHat[1] + p[2]*zHat[1],
				p[0]*xHat[2] + p[1]*yHat[2] + p[2]*zHat[2],
			];
			increment(p, this.pos);
			var d = sceneSDF(colObjs, p)[0];
			var amt = 0;
			if (d < this.colDist) {
				decrement(p, this.pos);
				const f = Math.min(this.colMult * ((this.colDist - d)), this.colMax);
				const v = this.colDamp * dot(p, this.dPos);
				increment(p, this.pos);
				amt = (f + v);
			}
			objs.push(createDescribedObject(TYPE_SPHERE, {
				r: 0.1 + amt / 3,
				material: new M_Color(128 + amt*256, 128 - amt*256, 0),
				pos: Pos(p[0], p[1], p[2]),
				intangible: true,
				parent: this
			}));
		}

		return objs;
	}

	/**
	 * a list of forces to apply to the whole body. These forces aren't generated by the world's collision. 
	 */
	pullState(obj, stableForcesArr) {
		this.ignore = obj;
		copyArr(obj.pos, this.pos);
		copyArr(obj.dPos, this.dPos);
		if (obj.world) {
			this.world = obj.world;
		}
		if (!stableForcesArr) {
			throw new Error(`Collider did not recieve proper stable forces array!`);
		}
		this.forces = stableForcesArr;
	}

	/**
	 * extracts a state out into an object by copying over pos + dPos.
	 */
	pushState(obj) {
		copyArr(this.pos, obj.pos);
		copyArr(this.dPos, obj.dPos);
		if (obj.world && this.world != obj.world) {
			//oughhhhh

			if (obj == player) {
				obj.world = this.world;
			}
		}
	}

	physStep(fMult) {
		this.calcPossibleObjs();
		this.calcColForces();
		//use forces to update acceleration
		this.calcAccel();
		//use acceleration to update momentum
		this.updateMomentum(fMult * phys_step);
		//use momentum to update position
		this.updatePosition(fMult * phys_step);

	}

	calcColForces() {
		const xHat = quatRotate([1, 0, 0], this.quat);
		const yHat = quatRotate([0, 1, 0], this.quat);
		const zHat = quatRotate([0, 0, 1], this.quat);
		//figure out what the points are
		const objs = this.possibleObjs;
		var colPoints = this.calcColPoints();
		
		//transform colPoints into world coordinates and calculate force
		for (var c=0; c<colPoints.length; c++) {
			var p = colPoints[c];
			p = [
				p[0]*xHat[0] + p[1]*yHat[0] + p[2]*zHat[0],
				p[0]*xHat[1] + p[1]*yHat[1] + p[2]*zHat[1],
				p[0]*xHat[2] + p[1]*yHat[2] + p[2]*zHat[2],
			];
			increment(p, this.pos);
			var d = sceneSDF(objs, p)[0];
			//go through each point. It acts as a spring that's compressed based on the sceneDist
			//F = kx + d•v
			if (d < this.colDist) {
				decrement(p, this.pos);
				const f = Math.min(this.colMult * ((this.colDist - d)), this.colMax);
				const v = this.colDamp * dot(p, this.dPos);
				this.forces.push(v3_mulS(p, -(f + v)));
			}
		}
	}

	calcAccel() {
		//F = ma, so a = F / m
		const invMass = 1 / this.mass;
		const forces = this.forces;
		var aPos = [0, 0, 0];

		// console.log(JSON.stringify(forces));
		
		//Fnet = ma which means a = Fnet/m
		for (var a=0; a<forces.length; a++) {
			mulrementS(forces[a], invMass);
			increment(aPos, forces[a]);
		}

		this.aPos = aPos;
	}

	//these are very simple. Just chunking through the integration steps
	updateMomentum(mult) {
		//subtract velocity of touching objects
		// this.contactObjs.forEach((obj => {
		// 	decrement(this.dPos, obj.dPos);
		// }).bind(this));
		
		mulrementS(this.aPos, mult);
		increment(this.dPos, this.aPos);
		recrementS(this.aPos, mult);

		//dMin
		var mag = magnitude(this.dPos);
		if (mag < this.dMin) {
			copyArr([0,0,0], this.dPos);
			return;
		}

		//dMax
		if (mag > this.dMax) {
			recrementS(this.dPos, mag / this.dMax);
			return;
		}

		// this.contactObjs.forEach((obj => {
		// 	increment(this.dPos, obj.dPos);
		// 	this.contactObjs.delete(obj);
		// }).bind(this));
	}

	updatePosition(mult) {
		mulrementS(this.dPos, mult);
		increment(this.pos, this.dPos);
		recrementS(this.dPos, mult);
		this.portalCheck();
	}

	portalCheck() {
		var res = sceneSDF(this.portalObjs, this.pos);
		if (res[0] < ray_minDist && worlds[res[1].material.str]) {
			increment(this.pos, res[1].material.offset);
			this.world = worlds[res[1].material.str];
		}
	}
}

class PhysStruct_Player extends PhysStruct {
	constructor(world, pos, quat, rx, ry, rz) {
		super(world, pos, quat, rx, ry, rz, false);
	}

	calcColPoints() {
		const w = this.rx;
		const hBar = this.ry;
		const s = Math.sqrt(2) / 2;

		//player's colPoints
		return [
			[0, hBar, 0],
			[w/2, -hBar, 0],
			[-w/2, -hBar, 0],
			[w, 0, 0],
			[-w, 0, 0],
			[0, 0, w],
			[0, 0, -w],
			[s*w, 0, s*w],
			[s*w, 0, -s*w],
			[-s*w, 0, -s*w],
			[-s*w, 0, s*w],
		];
	}
}

class PhysStruct_Box extends PhysStruct {
	constructor(world, pos, quat, rx, ry, rz) {
		super(world, pos, quat, rx, ry, rz, true);
	}

	calcColPoints() {
		const h = this.ry;
		const w = this.rx;
		const l = this.rz;

		return [
			[w, h, l],
			[w, h, -l],
			[w, -h, l],
			[w, -h, -l],
			[-w, h, l],
			[-w, h, -l],
			[-w, -h, l],
			[-w, -h, -l],
		];
	}
}

class PhysStruct_Null extends PhysStruct {
	constructor(world, pos) {
		super(world, pos, quatIdentity(), 1, 1, 1, false);
	}

	calcColPoints() {
		return [];
	}
}
// REALLY GOOD SDF RESOURCE:
// https://gist.github.com/munrocket/f247155fc22ecb8edf974d905c677de1

/*
we have:
see end of file for objects list. There are some others not listed there:

templates/abstract:
	Scene3dObject
	Scene3dObject_Axes
	Prism
	Spun

Meta-Objects:
	Scene3dLoop
	SceneCollection
 */

class ObjPropSet {
	constructor() {
		this.pos;
		this.quat;
		this.material;
		this.nature;
	}
}

//main object contract
class Scene3dObject {
	static type = TYPE_CLASS_OBJ;
	static canCreate = true;
	/**
	 * creates a basic scene3dObject. This is an abstract class, you can't put it into the world.
	 * @param {ObjPropSet} baseProps an object containing position, quaternion, and material.
	 */
	constructor(baseProps) {
		this.type = this.constructor.type;
		var {pos, material, nature, quat, theta, phi, rot} = baseProps;
		
		this.pos = pos;
		this.material = material ?? createDefaultMaterial();
		
		if (!nature || !nature.length) {
			nature = [nature, 1, 1, 0, 0, 0];
		}
		this.nature = nature[0] ?? N_NORMAL;
		this.gloopiness = nature[1] ?? 0.5;
		this.smoothness = nature[2] ?? 0.5;
		this.gloopExt = 0;
		
		this.ex = nature[3] ?? 0;
		this.ey = nature[4] ?? 0;
		this.ez = nature[5] ?? 0;
		
		this.quat = quat ?? quatIdentity();
		if (theta != undefined) {
			this.quat = quatFromEuler(theta ?? 0, phi ?? 0, rot ?? 0);
		}
	}
	
	//gives the axis-aligned bounding box of the object, in [smallest pos, largest pos] terms
	bounds() {
		return bounds_expand(bounds_gen(this.pos, ...this.bAxes(), this.quat), this.bAugAmt());
	}

	bAxes() {
		return [this.ex + 0.5, this.ey + 0.5, this.ez + 0.5];
	}

	bAugAmt() {
		var amt = this.gloopiness + this.gloopExt + this.smoothness;
		if (this.material.type == M_LIGHT || this.material.type == M_GHOST) {
			amt = Math.max(amt, ray_nearDist);
		}
		return [amt, amt, amt];
	}

	//give a single object or a list of objects that represent the expressed portion of this object. 
	express() {
		return [this];
	}

	tick() {
		if (this.material.tick) {
			this.material.tick(this);
		}
	}

	/**
	 * returns a position in object-relative coordinates given a world position. Factors in rotations and extrusions. 
	 */
	relPos(pos) {
		pos = quatUnrotate([pos[0] - this.pos[0], pos[1] - this.pos[1], pos[2] - this.pos[2]], this.quat);
		if (this.ex) {
			pos[0] -= clamp(pos[0], -this.ex, this.ex);
		}
		if (this.ey) {
			pos[1] -= clamp(pos[1], -this.ey, this.ey);
		}
		if (this.ez) {
			pos[2] -= clamp(pos[2], -this.ez, this.ez);
		}
		return pos;
	}
	
	distanceToPos(pos) {
		console.error(`SDF is not defined for ${this.constructor.name}!`);
		return -1;
	}
	
	normalAt(pos) {
		const ε = 0.01 - 0.02 * (this.nature & N_ANTI != 0);
		const base = this.distanceToPos(pos);
		const grad = [
			this.distanceToPos(Pos(pos[0] + ε, pos[1], pos[2])) - base,
			this.distanceToPos(Pos(pos[0], pos[1] + ε, pos[2])) - base,
			this.distanceToPos(Pos(pos[0], pos[1], pos[2] + ε)) - base,
		];
		return normalize(grad);
	}

	serialize() {
		const rot = packageQrot(this.quat).toString(32);
		var nature = serializeNat(this.nature, this.gloopiness, this.smoothness, this.ex, this.ey, this.ez);
		return `~[${this.pos}]~${nature}~${rot}|${this.material.serialize()}|`;
	}
	
	serializeGPU() {
		return [];
	}
}

class Scene3dObject_Axes extends Scene3dObject {
	static type = TYPE_CLASS_OBJAX;
	constructor(posRot, rx, ry, rz) {
		super(posRot);
		this.rx = Math.max(rx, 0);
		this.ry = Math.max(ry, 0);
		this.rz = Math.max(rz, 0);
	}

	bAxes() {
		return [this.rx + this.ex, this.ry + this.ey, this.rz + this.ez];
	}
	
	bounds() {
		return bounds_expand(bounds_gen(this.pos, ...this.bAxes(), this.quat), this.bAugAmt());
	}
	
	serialize() {
		return `${super.serialize()}${this.rx}~${this.ry}~${this.rz}`;
	}
	
	serializeGPU() {
		return [null, this.rx, this.ry, this.rz];
	}
}

class Prism extends Scene3dObject_Axes {
	static type = TYPE_CLASS_PRISM;
	constructor(posRot, rx, h, rz) {
		super(posRot, rx, h, rz);
	}
	
	sdf2D(relX, relY) {
		console.error(`2d SDF is not defined for object ${this.constructor.name}!`);
		return -1;
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		var relX = relPos[0];
		var relY = relPos[1];
		var relZ = relPos[2];
		
		const faceDist = this.sdf2D(relX, relY);
		const vertDist = Math.abs(relZ) - this.rz;
		const negPart = Math.min(Math.max(faceDist, vertDist), 0);
		const posPart = Math.hypot(Math.max(faceDist, 0), Math.max(vertDist, 0));
		return (negPart + posPart);
	}
	
	serializeGPU() {
		return [null, this.rx, this.ry, this.rz];
	}
}

class Scene3dLoop {
	static type = TYPE_CLASS_LOOP;
	/**
	* An object that contains other objects inside a looping space. 
	* Allows for large repeating spaces without needing the entire world to repeat.
	* @param {Integer} xRepeats number of times in the X direction to loop the object
	* @param {Integer} yRepeats number of times in the Y direction to loop the object
	* @param {Integer} zRepeats number of times in the Z direction to loop the object
	* @param {Integer} dx how large each loop is in the X direction
	* @param {Integer} dy how large each loop is in the Y direction
	* @param {Integer} dz how large each loop is in the Z direction
	* @param {Scene3dObject[]} objects the set of objects inside the loop
	 */
	constructor(posRot, xRepeats, yRepeats, zRepeats, dx, dy, dz, objects) {
		this.type = this.constructor.type;
		this.pos = posRot.pos;
		this.quat = posRot.quat ?? quatIdentity();
		if (posRot.theta != undefined) {
			this.quat = quatFromEuler(posRot.theta ?? 0, posRot.phi ?? 0, posRot.rot ?? 0);
		}
		
		this.rx = xRepeats;
		this.ry = yRepeats;
		this.rz = zRepeats;
		this.dx = dx;
		this.dy = dy;
		this.dz = dz;
		this.objects = objects;
		if (!objects) {
			console.log(arguments);
			throw new Error(`No objects in Scene3dLoop!`);
		}
		//single object, absorb properties
		if (objects.length == 1) {
			var absorb = objects[0];
			this.type = absorb.type + 100;
			this.material = absorb.material;
		}
	}

	express() {
		//if there are multiple objects.. break into them
		const self = this;
		const o0 = this.objects[0];
		var arr = this.objects.map((o) => {
			var newO = deserialize(o.serialize());
			newO.pos = Pos(0, 0, 0);
			var a = new Scene3dLoop({pos: v3_add(self.pos, o.pos), quat: copyArr(self.quat, [])},
									self.rx, self.ry, self.rz, self.dx, self.dy, self.dz, [newO]);
			a.parent = self;
			return a;
		});

		if (debug_flags.showLoopBounds) {
			arr.push(new BoxFrame({
				pos: v3_add(self.pos, o0.pos), quat: copyArr(self.quat, [])}, 
				(this.rx + 0.5) * this.dx, (this.ry + 0.5) * this.dy, (this.rz + 0.5) * this.dz, 1));
		}
		return arr;
	}
	
	normalAt(pos) {
		//TODO: not this
		return this.objects[0].normalAt(pos);
	}
	
	bounds() {
		return bounds_gen(this.pos,
			(this.rx + 0.5) * this.dx, (this.ry + 0.5) * this.dy, (this.rz + 0.5) * this.dz, this.quat);
	}

	relPos(pos) {
		return quatUnrotate(v3_sub(pos, this.pos), this.quat);
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const dx = this.dx | 0;
		const dy = this.dy | 0;
		const dz = this.dz | 0;
		const rx = this.rx | 0;
		const ry = this.ry | 0;
		const rz = this.rz | 0;
		var insideX = clamp(relPos[0], -rx * dx, rx * dx);
		var insideY = clamp(relPos[1], -ry * dy, ry * dy);
		var insideZ = clamp(relPos[2], -rz * dz, rz * dz);
		return sceneSDF(this.objects, Pos(
			modulateSigned(insideX, dx) + (relPos[0] - insideX),
			modulateSigned(insideY, dy) + (relPos[1] - insideY),
			modulateSigned(insideZ, dz) + (relPos[2] - insideZ),
		))[0];
	}
	
	tick() {
		this.objects.forEach(o => {
			o.tick();
		});
	}
	
	serialize() {
		const grStr = this.objects.map(a => a.serialize()).join(`\n\t||`);
		const rot = packageQrot(this.quat).toString(32);
		return `LOOP~[${this.pos}]~X~${rot}|${this.rx}~${this.ry}~${this.rz}~${this.dx}~${this.dy}~${this.dz}\n\t||${grStr}`;
	}
	
	serializeGPU() {
		//assume self has exactly ONE object.
		var obj = this.objects[0];
		var serial = obj.serializeGPU();
		serial[7] = packageQrot(this.quat);
		buf32_int[0] = ((this.dx & 0x3FF) << 20) | ((this.dy & 0x3FF) << 10) | (this.dz & 0x3FF);
		serial[8] = buf32_float[0];
		return serial;
	}
}

class SceneCollection {
	static type = TYPE_CLASS_GROUP;
	static canCreate = true+1;
	/**
	* An object that contains other serialized objects. 
	* When editing, basic translations / rotations can be applied to all the objects in the collection.
	*/
	constructor(posRot, objects) {
		this.type = this.constructor.type;
		this.pos = posRot.pos;
		this.material = posRot.material;
		this.quat = posRot.quat ?? quatIdentity();
		if (posRot.theta != undefined) {
			this.quat = quatFromEuler(posRot.theta ?? 0, posRot.phi ?? 0, posRot.rot ?? 0);
		}

		this.baseObjects = objects;
		this.expObjs = [];
	}
	
	bounds() {
		console.error(`bounds are not defined for ${this.constructor.name}!`);
		return bounds_gen(this.pos, 1,1,1, quatIdentity());
	}
	
	/**
	* apply any possible animations to a particular object group. 
	* Examples: stretching legs, blinking, etc.
	 */
	animate(objGroup) {
	
	}
	
	/**
	* apply transformations (position, rotation) to a particular object group. Happens after standard transform.
	* Examples: moving
	 */
	transform(objGroup) {
	
	} 

	express() {
		/*
		for a collection to express itself:
			start with base objects
			-> apply any animations
			-> apply standard transform
			-> profit!
		 */
		const [basePos, baseQuat] = [this.pos, this.quat];
		const self = this;
		var objs = this.baseObjects.map(s => deserialize(s));
		this.animate(objs);
		objs.forEach(o => {
			var t = transformTransform(o.pos, o.quat, basePos, baseQuat);
			o.parent = self;
			o.pos = t.pos;
			o.quat = t.quat;
		});
		this.transform(objs);
		this.expObjs = [];
		objs.forEach(o => {
			var exp = o.express();
			exp.forEach(oo => {
				this.expObjs.push(oo);
			});
		});
		return this.expObjs;
	}

	tick() {}
	
	distanceToPos(pos) {
		console.error(`Do not call the SDF for SceneCollections!`);
		return -1;
	}
	
	serializeKernel() {
		const rotInt = packageQrot(this.quat).toString(32);
		return `~[${this.pos}]~X~${rotInt}||`;
	}

	serialize() {
		return `COLLECTION${this.serializeKernel()}${this.objects}`;
	}
}

class SceneCollectionGeneric extends SceneCollection {
	static type = TYPE_MESH_GENERIC;
	constructor(posRot, meshName) {
		meshName = meshName ?? `dotdotdot`;
		super(posRot, meshes[meshName]);
		this.meshName = meshName;
	}

	express() {
		this.baseObjects = meshes[this.meshName] ?? meshes[`dotdotdot`];
		return super.express();
	}
	
	serialize() {
		return `GENERIC${super.serializeKernel()}"${this.meshName}"`;
	}
}


class SceneCollectionLoose {
	static type = TYPE_CLASS_LGROUP;
	/**
	 * a SceneCollectionLoose is a wrapper around a bunch of objects. 
	 * You can apply translations / rotations to it, and it will apply them to the individual objects.
	 * It's not a SceneCollection, because it's not intended to be cohesive. 
	 * Instead, you are intended to just throw things in here, modify them, and then safely dissolve the collection.
	 */
	constructor(posRot, objects) {
		this.type = this.constructor.type;
		if (objects && objects.type != undefined) {
			objects = [objects];
		}
		this.objects = new Set(objects);
		this.createTransform();
	}

	createTransform() {
		//variables that others will update
		this.pos = Pos(0, 0, 0);
		this.quat = quatIdentity();
		//stable variants - used to track what should actually be updated
		this.sPos = Pos(0, 0, 0);
		this.sQuat = quatIdentity();

		[this.minPos, this.maxPos] = boundsForList(this.objects);
		for (var x=0; x<3; x++) {
			this.pos[x] = (this.minPos[x] + this.maxPos[x]) / 2;
			this.sPos[x] = this.pos[x];
		}
	}

	/**
	 * add an object to the collection. 
	 * @param {Scene3dObject} obj the object to add
	 */
	addObj(obj) {
		this.objects.add(obj);
		this.createTransform();
	}

	removeObj(obj) {
		this.objects.delete(obj);
		this.createTransform();
	}

	tick() {
		//apply transform delta, if there is one
		console.log(`ticking`);
		const q1 = this.quat;
		const q2 = this.sQuat;
		if (q1[0] != q2[0] || q1[1] != q2[1] || q1[2] != q2[2] || q1[3] != q2[3]) {
			var offsetQuat = normalize(quatMultiply(quatInv(this.sQuat), this.quat));
		
			//TODO: figure this out
			this.objects.forEach(o => {
				decrement(o.pos, this.sPos);
				const newTrans = transformTransform(o.pos, o.quat, this.sPos, offsetQuat);
				o.pos = newTrans.pos;
				o.quat = newTrans.quat;
			});

			copyArr(this.quat, this.sQuat);
			loading_world.shouldRegen = true;
		}

		//apply translation
		if (getDistancePos(this.pos, this.sPos) > 0.01) {
			const diff = v3_sub(this.pos, this.sPos);
			this.objects.forEach(o => {
				increment(o.pos, diff);
			});

			increment(this.minPos, diff);
			increment(this.maxPos, diff);
			copyArr(this.pos, this.sPos);

			loading_world.shouldRegen = true;
		}
	}

	//remove self from the objectsArray and add each of the constituent parts to said array
	break(objectsArr) {
		var ind = objectsArr.indexOf(this);
		if (ind != -1) {
			objectsArr.splice(ind, 1);
		}

		this.objects.forEach(o => {
			objectsArr.push(o);
		});
	}
	
	serialize() {
		const grStr = Array.from(this.objects).map(a => a.serialize()).join(`\n\t||`);
		const pos = this.sPos;
		return `GROUP-L~[${pos}]~X~0~90~0|\n\t||${grStr}`;
	}

	distanceToPos() {
		console.error(`Do not call the SDF for Loose Collections!`);
		return -1;
	}
	express() {
		console.error(`don't.`);
	}
}



class Box extends Scene3dObject_Axes {
	static type = TYPE_BOX;
	constructor(posRot, rx, ry, rz) {
		super(posRot, rx, ry, rz);
	}

	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const x = Math.abs(relPos[0]) - this.rx;
		const y = Math.abs(relPos[1]) - this.ry;
		const z = Math.abs(relPos[2]) - this.rz;
		
		const dExt = Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0));
		const dInt = Math.min(Math.max(x, y, z), 0);
		
		return dExt + dInt;
	}

	serialize() {
		return `BOX${super.serialize()}`;
	}
}

class BoxFrame extends Scene3dObject_Axes {
	static type = TYPE_BOXFRAME;
	constructor(posRot, rx, ry, rz, thickness) {
		super(posRot, rx, ry, rz);
		this.e = thickness;
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relX = Math.abs(relPos[0]) - this.rx;
		const relY = Math.abs(relPos[1]) - this.ry;
		const relZ = Math.abs(relPos[2]) - this.rz;
		
		const e = this.e;
		const welX = Math.abs(relX + e) - e;
		const welY = Math.abs(relY + e) - e;
		const welZ = Math.abs(relZ + e) - e;
		
		var distX = Math.hypot(Math.max(relX, 0), Math.max(welY, 0), Math.max(welZ, 0)) + Math.min(Math.max(relX, Math.max(welY, welZ)), 0);
		var distY = Math.hypot(Math.max(welX, 0), Math.max(relY, 0), Math.max(welZ, 0)) + Math.min(Math.max(welX, Math.max(relY, welZ)), 0);
		var distZ = Math.hypot(Math.max(welX, 0), Math.max(welY, 0), Math.max(relZ, 0)) + Math.min(Math.max(welX, Math.max(welY, relZ)), 0);
		return Math.min(distX, distY, distZ);
	}
	
	serialize() {
		return `BOX-FRAME${super.serialize()}~${this.e}`;
	}
	
	serializeGPU() {
		return super.serializeGPU().concat(this.e);
	}
}

//just an extruded sphere... should I really keep this?
class Capsule extends Scene3dObject {
	static type = TYPE_CAPSULE;
	constructor(posRot, r, h) {
		super(posRot);
		this.r = r;
		this.h = h;
	}

	bAxes() {
		return [this.r + this.ex, this.r + this.ey, this.h + this.r + this.ez];
	}

	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relX = Math.abs(relPos[0]);
		const relY = Math.abs(relPos[1]);
		var   relZ = Math.abs(relPos[2]);
		relZ -= clamp(relZ, 0, this.h);
		return Math.sqrt(relX * relX + relY * relY + relZ * relZ) - this.r;
	}
	
	serialize() {
		return `CAPSULE${super.serialize()}${this.r}~${this.h}`;
	}
	
	serializeGPU() {
		return [this.r, this.h];
	}
}

//cube, standard object
class Cube extends Scene3dObject {
	static type = TYPE_CUBE;
	constructor(posRot, r) {
		super(posRot);
		this.r = r;
	}

	bAxes() {
		return [this.r + this.ex, this.r + this.ey, this.r + this.ez];
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const r = this.r;
		const x = Math.abs(relPos[0]) - r;
		const y = Math.abs(relPos[1]) - r;
		const z = Math.abs(relPos[2]) - r;
		const dExt = Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0));
		const dInt = Math.min(Math.max(x, y, z), 0);
		
		return dExt + dInt;
	}

	serialize() {
		return `CUBE${super.serialize()}${this.r}`;
	}
	
	serializeGPU() {
		return [null, this.r, this.r, this.r];
	}
}

class Cylinder extends Scene3dObject {
	static type = TYPE_CYLINDER;
	constructor(posRot, r, h) {
		super(posRot);
		this.r = r;
		this.h = h;
	}

	bAxes() {
		return [this.r + this.ex, this.r + this.ey, this.h + this.ez];
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relX = relPos[0];
		const relY = relPos[1];
		const relZ = relPos[2];
		
		const hDist = Math.abs(relZ) - this.h;
		const xyDist = Math.hypot(relX, relY) - this.r;
		return Math.min(Math.max(hDist, xyDist), 0) + Math.hypot(Math.max(xyDist, 0), Math.max(hDist, 0));
	}
	
	serialize() {
		return `CYLINDER${super.serialize()}${this.r}~${this.h}`;
	}
	
	serializeGPU() {
		return [this.r, this.h];
	}
}

//TODO: SDF is wrong, not a proper euclidian distance
class Ellipsoid extends Scene3dObject_Axes {
	static type = TYPE_ELLIPSE;
	constructor(posRot, rx, ry, rz) {
		super(posRot, rx, ry, rz);
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relX = Math.abs(relPos[0]) / this.rx;
		const relY = Math.abs(relPos[1]) / this.ry;
		const relZ = Math.abs(relPos[2]) / this.rz;
		const rrx = relX / this.rx;
		const rry = relY / this.ry;
		const rrz = relZ / this.rz;
		
		var d = Math.sqrt((relX * relX) + (relY * relY) + (relZ * relZ));
		var d2 = Math.sqrt((rrx * rrx) + (rry * rry) + (rrz * rrz));
		
		// return d - 1;
		return d * (d - 1) / d2;
	}
	
	serialize() {
		return `ELLIPSE${super.serialize()}`;
	}
}

class Fractal extends Scene3dObject {
	static type = TYPE_FRACTAL;
	constructor(posRot, r, scale, shiftX, shiftY, shiftZ) {
		super(posRot);
		this.r = r;
		this.b = scale;
		this.shift = Pos(shiftX, shiftY, shiftZ);
	}
	
	tick() {
		// [this.shift[0], this.shift[2]] = rotate(this.shift[0], this.shift[2], 0.005);
		// if (gl && loading_world.objects.includes(this)) {
		// 	loading_world.bvh.generate();
		// 	createGPUWorld(loading_world);
		// }
	}
	
	//copy from shaderF but with less swizzling
	distanceToPos(pos) {
		//setup
		const r = this.r;
		const scale = this.b;
		const shift = this.shift;
		const a1 = -this.theta;
		const a2 = -this.phi;
		
		var px = (pos[0] - this.pos[0]) / r;
		var py = (pos[1] - this.pos[1]) / r;
		var pz = (pos[2] - this.pos[2]) / r;
		var pw = 1;
		
		//recursion
		for (var f=0; f<fractal_iters; f++) {
			px = Math.abs(px);
			py = Math.abs(py);
			pz = Math.abs(pz);
			//TODO: pull this rotate call out of the loop
			[px, py] = rotate(px, py, a1);
			
			var a = Math.min(px - py, 0);
			px -= a;
			py += a;
			a = Math.min(px - pz, 0);
			px -= a;
			pz += a;
			a = Math.min(py - pz, 0);
			py -= a;
			pz += a;
			
			[py, pz] = rotate(py, pz, a2);
			px *= scale;
			px += shift[0];
			py *= scale;
			py += shift[1];
			pz *= scale;
			pz += shift[2];
			pw *= scale;
		}
		
		px -= 6;
		py -= 6;
		pz -= 6;
		
		const len = Math.hypot(Math.max(0, px), Math.max(0, py), Math.max(0, pz));
		return r * (Math.min(0, Math.max(px, py, pz)) + len) / pw;
	}
	
	bounds() {
		return bounds_expand(bounds_gen(this.pos, 10000, 10000, 10000, quatIdentity()),this.bAugAmt());
	}
	
	serialize() {
		return `FRACTAL${super.serialize()}${this.r}~${this.b}~${this.shift[0]}~${this.shift[1]}~${this.shift[2]}`;
	}
	
	serializeGPU() {
		return [this.r, this.b, this.theta, this.phi, fencepost32, ...this.shift];
	}
}

class Gyroid extends Scene3dObject_Axes {
	static type = TYPE_GYROID;
	constructor(posRot, rx, ry, rz, a, b, h) {
		super(posRot, rx, ry, rz);
		this.a = a ?? 0.08;
		this.b = b ?? 13;
		this.h = h;
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relX = relPos[0];
		const relY = relPos[1];
		const relZ = relPos[2];
		const a = this.a;
		const dot = 
			(Math.sin(a * relX) * Math.cos(a * relZ)) + 
			(Math.sin(a * relY) * Math.cos(a * relX)) + 
			(Math.sin(a * relZ) * Math.cos(a * relY));
		
		const x = Math.max(0, Math.abs(relX) - this.rx);
		const y = Math.max(0, Math.abs(relY) - this.ry);
		const z = Math.max(0, Math.abs(relZ) - this.rz);
		
		const gyroidSDF = Math.abs(this.b * dot) - this.h;
		const boxSDF = Math.sqrt(x * x + y * y + z * z);
		
		
		return Math.max(boxSDF, gyroidSDF);
	}
	
	serialize() {
		return `GYROID${super.serialize()}~${this.a}~${this.b}~${this.h}`;
	}
	
	serializeGPU() {
	//[a, rx, ry, rz, b, h, 0, 0, 0]
		var params = super.serializeGPU();
		params[0] = this.a;
		return params.concat(this.b, this.h);
	}
}

//line has 3d radii for the sake of constructor / editor simplicity.
//The offset point is not really a "radius" by any metric but eh. whatever.
class Line extends Scene3dObject {
	static type = TYPE_LINE;
	constructor(posRot, rx, ry, rz, thickness) {
		super(posRot);
		this.offP = Pos(rx, ry, rz);
		this.posEnd = Pos(
			this.pos[0] + rx,
			this.pos[1] + ry,
			this.pos[2] + rz
		);
		this.quat = quatIdentity();
		this.r = thickness;
	}

	express() {
		this.refresh();
		var base = [this];
		if (debug_listening) {
			// var o1 = createDefaultObject();
			base.push(createDescribedObject(TYPE_SPHERE, {
				r: this.r * 1.5,
				pos: this.pos,
				parent: this
			}));
			base.push(createDescribedObject(TYPE_SPHERE, {
				r: this.r * 1.5,
				pos: this.posEnd,
				parent: this
			}));
		}
		return base;
	}

	selectFrom(obj) {
		if (obj.type) {
			return this;
		}
		const endDist = getDistancePos(obj.pos, this.posEnd);
		const startDist = getDistancePos(obj.pos, this.pos);
		var p;
		if (endDist < startDist) {
			p = new Point(this.offP, this.pos);
			p.parent = this;
			return p;
		} else {
			p = new Point(this.pos, Pos(0,0,0), [this.offP]);
			p.parent = this;
			return p;
		}
	}

	refresh() {
		const off = this.offP;
		this.posEnd = Pos(this.pos[0] + off[0], this.pos[1] + off[1], this.pos[2] + off[2]);
	}
	
	bounds() {
		this.refresh();
		const p = this.pos;
		const pE = this.posEnd;
		const r = this.r;
		return bounds_expandU(bounds_expand([Pos(
			Math.min(p[0], pE[0]),
			Math.min(p[1], pE[1]),
			Math.min(p[2], pE[2]),
		), Pos (
			Math.max(p[0], pE[0]),
			Math.max(p[1], pE[1]),
			Math.max(p[2], pE[2]),
		)], this.bAugAmt()), r);
	}
	
	distanceToPos(pos) {
		//lambda = clamp((P-A)•(B-A)/(B-A)•(B-A), 0, 1)
		//then closest = linterp(A, B, lambda)
		//dist = dist to closest
		const base = this.pos;
		const lineVec = this.offP;
		const lineDot = dot(lineVec, lineVec);
		const apVec = [pos[0] - base[0], pos[1] - base[1], pos[2] - base[2]];
		const l = clamp(dot(apVec, lineVec) / lineDot, 0, 1);
			
		return (getDistance(pos[0], pos[1], pos[2], 
				linterp(base[0], base[0] + lineVec[0], l), linterp(base[1], base[1] + lineVec[1], l), linterp(base[2], base[2] + lineVec[2], l)) - this.r);
	}
	
	serialize() {
		return `LINE${super.serialize()}${this.offP[0]}~${this.offP[1]}~${this.offP[2]}~${this.r}`;
	}
	
	serializeGPU() {
		return [null, ...this.offP, this.r];
	}
}


//like a line but with 2 separate radii
class Dish extends Line {
	static type = TYPE_DISH;
	constructor(posRot, rx, ry, rz, ra, rb) {
		super(posRot, rx, ry, rz, ra);
		this.ringR = rb;
	}

	express() {
		var base = super.express();
		if (base.length > 1) {
			base[1].r = Math.min(4, this.r + 2);
			base[2].r = Math.min(4, this.ringR + 2);
		}
		return base;
	}
	
	bounds() {
		const r = this.r;
		const rr = this.ringR;
		const posEnd = this.posEnd;
		return bounds_expand([Pos(
			Math.min(this.pos[0] - r, posEnd[0] - rr),
			Math.min(this.pos[1] - r, posEnd[1] - rr),
			Math.min(this.pos[2] - r, posEnd[2] - rr),
		), Pos (
			Math.max(this.pos[0] + r, posEnd[0] + rr),
			Math.max(this.pos[1] + r, posEnd[1] + rr),
			Math.max(this.pos[2] + r, posEnd[2] + rr),
		)], this.bAugAmt());
	}
	
	distanceToPos(pos) {
		const rba = this.ringR - this.r;
		const b_a = this.offP;
		const p_a = v3_sub(pos, this.pos);
		const baba = dot(b_a, b_a);
		const papa = dot(p_a, p_a);
		const paba = dot(p_a, b_a) / baba;
		const x = Math.sqrt(papa - paba * paba * baba);
		const cax = Math.max(0, x - (paba < 0.5) ? this.r : this.ringR);
		const cay = Math.abs(paba - 0.5) - 0.5;
		const k = rba * rba + baba;
		const f = clamp((rba * (x - this.r) + paba * baba) / k, 0, 1);
		const cbx = x - this.r - f * rba;
		const cby = paba - f;
		const s = (cbx < 0.0 && cay < 0.0) ? -1 : 1;
		return s * Math.sqrt(Math.min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
	}
	
	serialize() {
		return `DISH${super.serialize().slice(4)}~${this.ringR}`;
	}
	
	serializeGPU() {
		return [this.r, ...this.offP, this.ringR];
	}
}



class Catenary extends Line {
	static type = TYPE_CATENARY;
	constructor(posRot, rx, ry, rz, thickness, arclen, flipVertical) {
		super(posRot, rx, ry, rz, thickness);
		this.arclen = arclen;
		this.pts = 9;
		this.pointSet = [];
		this.flip = flipVertical ?? 0;
		
	}

	bounds() {
		var yMin = 1e101;
		var yMax = -1e101;
		this.pointSet.forEach(p => {
			yMin = Math.min(yMin, p[1]);
			yMax = Math.max(yMax, p[1]);
		});

		return bounds_expandU(bounds_expand([
			Pos(
				Math.min(this.pos[0], this.posEnd[0]),
				yMin,
				Math.min(this.pos[2], this.posEnd[2]),
			), Pos(
				Math.max(this.pos[0], this.posEnd[0]),
				yMax,
				Math.max(this.pos[2], this.posEnd[2]),
			)
		], this.bAugAmt()), this.r);
	}

	express() {
		this.refresh();
		const ps = this.pointSet;
		var base = super.express().slice(1);
		for (var v=1; v<ps.length; v++) {
			const o = new Line({pos: ps[v-1], material: this.material, nature: this.nature},
				ps[v][0] - ps[v-1][0], ps[v][1] - ps[v-1][1], ps[v][2] - ps[v-1][2], 
				this.r);
			o.parent = this;
			base.push(o);
		}
		return base;
	}

	refresh() {
		super.refresh();
		/*the goal here is to approximate a catenary with straight lines. In order to do that we pick points on the catenary and then connect them
		but how to get points? How to get the catenary? 
		first simplify the case: a catenary has 3 degrees of freedom. The start point, end point, and length give us enough info to solve.
		Hyperbolic functions are messy so there's a little newton's method along the way. Other than that it's not too bad
		*/

		if (this.flip) {
			this.offP[1] = -this.offP[1];
		}

		//set up: parametrize
		var vec = [this.offP[0], this.offP[2]];
		const sign = -2*this.flip + 1;
		const dx = Math.sqrt(vec[0]**2 + vec[1]**2);
		var h = this.offP[1] / dx;
		var L = this.arclen / dx;

		//calculate correct catenary: y=(a cosh((x-b)/a) + c)
		var r = Math.sqrt(L*L - h*h);
		//at r=0 the curve is a straight line. At r<0 the curve cannot exist
		if (r < 0.6) {
			//simplify to the straight line case, fix parameters for later
			this.arclen = 1.05 * Math.hypot(...this.offP);
			this.pointSet = [this.pos, this.posEnd];
			console.log(`cannot construct catenary!`);
			r = 0.5;
		} else {
			var A = Math.sqrt(6 * r - 1);

			//solve for A ):
			A = A - (Math.sinh(A) - r*A) / (Math.cosh(A) - r);
			A = A - (Math.sinh(A) - r*A) / (Math.cosh(A) - r);
			A = A - (Math.sinh(A) - r*A) / (Math.cosh(A) - r);
			A = A - (Math.sinh(A) - r*A) / (Math.cosh(A) - r);
	
			var a = 0.5 / A;
			var b = 0.5 - a * Math.atanh(h / L);
			var c = -a * Math.cosh(-b / a);

			this.pointSet = [this.pos];
			for (var e=1; e<this.pts; e++) {
				const t = e / this.pts;
				const result = (a * Math.cosh((t - b) / a) + c);
				this.pointSet[e] = [
					linterp(this.pos[0], this.posEnd[0], t),
					this.pos[1] + sign * dx * result,
					linterp(this.pos[2], this.posEnd[2], t),
				];
			}
			this.pointSet[this.pts] = this.posEnd;
		}

		if (this.flip) {
			this.offP[1] = -this.offP[1];
		}
	}

	serialize() {
		return `CATENARY${super.serialize().slice(4)}~${this.arclen}~${+this.flip}`;
	}
}

//editor-only class 
class Point {
	constructor(pt, offset, invertPts) {
		offset = offset ?? Pos(0, 0, 0);
		this.pos = Pos(pt[0] + offset[0], pt[1] + offset[1], pt[2] + offset[2]);
		this.quat = quatIdentity();
		this.store = pt;
		this.invStore = invertPts ?? [];
		this.offset = offset;

		this.nature = N_NORMAL;
	}

	tick() {
		for (var i=0; i<3; i++) {
			const goalPos = this.pos[i] - this.offset[i];
			const delta = goalPos - this.store[i];
			//need to update things
			if (Math.abs(delta) > 0.1) {
				this.store[i] += delta;
				this.invStore.forEach(p => {
					p[i] -= delta;
				});
			}
		}
		loading_world.shouldRegen = true;
	}
}

class Triangle extends Scene3dObject {
	static type = TYPE_TRIANGLE;
	constructor(posRot, p2x, p2y, p2z, thickness, p3x, p3y, p3z) {
		super(posRot);
		this.quat = quatIdentity();
		this.p1 = this.pos;
		this.off2 = Pos(p2x, p2y, p2z);
		this.off3 = Pos(p3x, p3y, p3z);
		this.p2 = v3_add(this.pos, this.off2);
		this.p3 = v3_add(this.pos, this.off3);

		this.r = thickness;
		// this.posData = [
		// 	[this.pos, ABSOLUTE],
		// 	[this.off2, RELATIVE],
		// 	[this.off3, RELATIVE],
		// ];
	}

	refresh() {
		const p = this.pos;
		this.p2 = v3_add(p, this.off2);
		this.p3 = v3_add(p, this.off3);
	}

	express() {
		this.refresh();
		var base = [this];
		if (debug_listening) {
			base.push(createDescribedObject(TYPE_SPHERE, {
				r: this.r * 1.5,
				parent: this,
				pos: this.pos,
			}));
			base.push(createDescribedObject(TYPE_SPHERE, {
				r: this.r * 1.5,
				parent: this,
				pos: this.p2,
			}));
			base.push(createDescribedObject(TYPE_SPHERE, {
				r: this.r * 1.5,
				parent: this,
				pos: this.p3,
			}));
		}
		return base;
	}

	selectFrom(obj) {
		if (obj == this) {
			return this;
		}

		//point 1
		if (getDistancePos(obj.pos, this.pos) < 1) {
			return new Point(this.pos, Pos(0, 0, 0), [this.off2, this.off3]);
		}

		//point 2
		if (getDistancePos(obj.pos, this.p2) < 1) {
			return new Point(this.off2, this.pos);
		}

		//point 3
		if (getDistancePos(obj.pos, this.p3) < 1) {
			return new Point(this.off3, this.pos);
		}

		return this;
	}
	
	bounds() {
		this.refresh();
		return bounds_expandU(bounds_expand([Pos(
			Math.min(this.pos[0], this.p2[0], this.p3[0]),
			Math.min(this.pos[1], this.p2[1], this.p3[1]),
			Math.min(this.pos[2], this.p2[2], this.p3[2]),
		), Pos (
			Math.max(this.pos[0], this.p2[0], this.p3[0]),
			Math.max(this.pos[1], this.p2[1], this.p3[1]),
			Math.max(this.pos[2], this.p2[2], this.p3[2]),
		)], this.bAugAmt()), this.r);
	}
	
	//ough
	distanceToPos(pos) {
		const a = this.pos;
		const b = this.p2;
		const c = this.p3;
		const pa = v3_sub(pos, a);
		const pb = v3_sub(pos, b);
		const pc = v3_sub(pos, c);
		const ba = v3_sub(b, a);
		const cb = v3_sub(c, b);
		const ac = v3_sub(a, c);

		const nor = cross(ba, ac);

		const s1 = Math.sign(dot(cross(ba, nor), pa));
		const s2 = Math.sign(dot(cross(cb, nor), pb));
		const s3 = Math.sign(dot(cross(ac, nor), pc));

		if (s1 + s2 + s3 < 2) {
			//outside tri
			const d1 = segmentDist2(ba, pa);
			const d2 = segmentDist2(cb, pb);
			const d3 = segmentDist2(ac, pc);
			return Math.sqrt(Math.min(d1, d2, d3));
		}

		//inside tri
		const nd = dot(nor, pa);
		return Math.sqrt((nd * nd) / dot(nor, nor));
	}
	
	serialize() {
		const of2 = this.off2;
		const of3 = this.off3;
		return `TRI${super.serialize()}${of2[0]}~${of2[1]}~${of2[2]}~${this.r}~${of3[0]}~${of3[1]}~${of3[2]}`;
	}
	
	serializeGPU() {
		return [this.r, this.off2[0], this.off2[1], this.off2[2], fencepost32, this.off3[0], this.off3[1], this.off3[2]];
	}
}

class Octahedron extends Scene3dObject_Axes {
	static type = TYPE_OCTAHEDRON;
	constructor(posRot, rx, ry, rz) {
		super(posRot, rx, ry, rz);
	}
	
	//TODO: probably broken in some way
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		var relX = Math.abs(relPos[0]);
		var relY = Math.abs(relPos[1]);
		var relZ = Math.abs(relPos[2]);
		
		var A = -1 / this.rx;
		var B = -1 / this.ry;
		var C = -1 / this.rz;
		var d = A*relX + B*relY + C*relZ + 1;
		return Math.abs(d) / Math.sqrt(A*A + B*B + C*C);
	}
	
	serialize() {
		return `OCTAHEDRON${super.serialize()}`;
	}
}

class PrismRhombus extends Prism {
	static type = TYPE_PRISM_RHOMBUS;
	constructor(posRot, rx, h, rz, skew) {
		super(posRot, rx, h, rz);
		this.skew = skew;
	}

	bAxes() {
		return [this.rx + Math.abs(this.skew / 2) + this.ex, this.ry + this.ey, this.rz + this.ez];
	}
	
	sdf2D(relX, relY) {
		if (relY < 0) {
			relX = -relX;
			relY = -relY;
		}
		
		const skew = this.skew / 2;
		const hegt = this.ry;
		const widt = this.rx;
		
		var w0 = relX - skew;
		var w1 = relY - hegt;
		w0 = w0 - clamp(w0, -widt, widt);
		var d0 = w0*w0 + w1*w1;
		var d1 = -w1;
		
		const s = relX * hegt - relY * skew;
		if (s < 0) {
			relX = -relX;
			relY = -relY;
		}
		var v0 = relX - widt;
		var v1 = relY;
		
		const ve = v0 * skew   + v1 * hegt;
		const ee = skew * skew + hegt * hegt;
		const gweh = clamp(ve / ee, -1, 1);
		
		v0 = v0 - skew * gweh;
		v1 = v1 - hegt * gweh;
		const vv = v0 * v0 + v1 * v1;
		
		d0 = Math.min(d0, vv);
		d1 = Math.min(d1, widt * hegt - Math.abs(s));
		
		return Math.sqrt(d0) * Math.sign(-d1);
	}
	
	serialize() {
		return `PRISM-RHOMBUS${super.serialize()}~${this.skew}`;
	}
	
	serializeGPU() {
		return super.serializeGPU().concat(this.skew);
	}
}

class PrismTri extends Prism {
	static type = TYPE_PRISM_TRI;
	constructor(posRot, rx, ry, h) {
		super(posRot, rx, ry, h);
	}

	sdf2D(relX, relY) {
		return sdfTri(relX, relY, this.rx, this.ry);
	}
	
	serialize() {
		return `PRISM-TRIGON${super.serialize()}`;
	}
}

class PrismHexagon extends Prism {
	static type = TYPE_PRISM_HEX;
	constructor(posRot, rx, ry, h) {
		super(posRot, rx, ry, h);
		this.ry = this.rx;
	}

	sdf2D(relX, relY) {
		const sqrt3 = -0.866025404;
		const invSqrt3 = 1 / sqrt3;
		
		relX = Math.abs(relX);
		relY = Math.abs(relY);
		
		var relDot = 2 * Math.min(sqrt3 * relX + 0.5 * relY, 0);
		relX -= relDot * sqrt3;
		relX -= clamp(relX, -invSqrt3 * this.rx, invSqrt3 * this.rx);
		relY -= relDot * 0.5;
		relY -= this.rx;
		
		return Math.sqrt(relX * relX + relY * relY) * Math.sign(relY);
	}
	
	serialize() {
		return `PRISM-HEXAGON${super.serialize()}`;
	}
}

class PrismOctagon extends Prism {
	static type = TYPE_PRISM_OCT;
	constructor(posRot, rx, ry, h) {
		super(posRot, rx, ry, h);
		this.ry = this.rx;
	}

	// express() {
	// 	return [];
	// }


	// vec3 magicNums = vec3(-0.9238795325, 0.382683, 0.4142135);
	// point = abs(point);
	// point -= 2. * min(dot(magicNums.xy, point), 0.) * magicNums.xy;
	// point -= 2. * min(dot(vec2(-magicNums.x, magicNums.y), point), 0.) * vec2(-magicNums.x, magicNums.y);
	// point.x -= clamp(point.x, -magicNums.z * r, magicNums.z * r);
	// point.y -= r;
	// return (point.y > 0.) ? length(point) : -length(point);
	
	sdf2D(relX, relY) {
		relX = Math.abs(relX);
		relY = Math.abs(relY);
	
		const magic0 = -0.9238795325;
		const magic1 = 0.3826834323;
		const magic2 = Math.SQRT2 - 1;
		const r = this.rx;
		
		const dot1 = 2 * Math.min(magic0 * relX + magic1 * relY, 0);
		relX -= dot1 * magic0;
		relY -= dot1 * magic1;
		const dot2 = 2 * Math.min(-magic0 * relX + magic1 * relY, 0);
		relX -= dot2 * -magic0;
		relY -= dot2 * magic1;
		relX -= clamp(relX, -magic2 * r, magic2 * r);
		relY -= r;
		
		return Math.sqrt(relX * relX + relY * relY) * Math.sign(relY);
	}
	
	serialize() {
		return `PRISM-OCTAGON${super.serialize()}`;
	}
}

class Ramp extends PrismRhombus {
	/**
	* creates a ramp with given parameters that travels in the x direction.
	 */
	constructor() {
		
	}
}

class Spun extends Scene3dObject {
	static type = TYPE_CLASS_SPUN;
	constructor(posRot, r, rx, ry) {
		super(posRot);
		this.r = r;
		this.rx = rx;
		this.ry = ry;
	}

	bAxes() {
		const a = Math.abs;
		return [this.r + a(this.rx) + this.ex, this.r + a(this.rx) + this.ey, a(this.ry) + this.ez];
	}

	sdf2D(relX, relY) {
		return -1;
	}

	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const distX = Math.abs(relPos[0]);
		const distY = Math.abs(relPos[1]);
		const distZ = Math.abs(relPos[2]);
		const q = Math.sqrt(distX * distX + distY * distY) - this.r;
		return this.sdf2D(q, distZ);
	}

	serialize() {
		return `${super.serialize()}${this.r}`;
	}

	serializeGPU() {
		return [this.r, this.rx, this.ry];
	}
}

class Ring extends Spun {
	static type = TYPE_RING;
	constructor(posRot, r, ringR) {
		super(posRot, r, ringR, ringR);
		this.ringR = ringR;
	}

	sdf2D(relX, relY) {
		return Math.sqrt(relX*relX + relY*relY) - this.ringR;
	}

	bounds() {
		this.rx = this.ringR;
		this.ry = this.ringR;
		return super.bounds();
	}

	serialize() {
		return `RING${super.serialize()}~${this.ringR}`;
	}
	
	serializeGPU() {
		return [this.r, this.ringR];
	}
}

class RingBox extends Spun {
	static type = TYPE_RING_BOX;

	sdf2D(relX, relY) {
		relX = Math.abs(relX) - this.rx;
		relY = Math.abs(relY) - this.ry;
		const dExt = Math.sqrt(Math.max(relX, 0) ** 2 + Math.max(relY, 0) ** 2);
		const dInt = Math.min(Math.max(relX, relY), 0);
		return dExt + dInt;
	}
	
	serialize() {
		return `RING-BOX${super.serialize()}~${this.rx}~${this.ry}`;
	}
}

class RingTri extends Spun {
	static type = TYPE_RING_TRI;

	sdf2D(relX, relY) {
		return sdfTri(relX, relY, this.rx, this.ry);
	}
	
	serialize() {
		return `RING-TRI${super.serialize()}~${this.rx}~${this.ry}`;
	}
}

class Terrain extends Scene3dObject_Axes {
	static type = TYPE_TERRAIN;
	constructor(posRot, rx, ry, rz, baseAmplitude, baseFrequency, octaves, lacunarity, gain) {
		super(posRot, rx, ry, rz);
		this.ampl = baseAmplitude;
		this.freq = baseFrequency;
		this.n = octaves;
		this.a = lacunarity;
		this.b = gain;
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const relBoxX = Math.abs(relPos[0]) - this.rx;
		const relBoxY = Math.abs(relPos[1]) - this.ry;
		const relBoxZ = Math.abs(relPos[2]) - this.rz;
		const boxsdf = Math.hypot(Math.max(relBoxX, 0), Math.max(relBoxY, 0), Math.max(relBoxZ, 0));
		
		const octaves = this.n;
		
		var y = 0;
		var ampl = this.ampl;
		var freq = this.freq;
		for (var i=0; i<octaves; i++) {
			var val = noise(relPos[0] * freq, relPos[2] * freq);
			y += ampl * val;
			freq *= this.a;
			ampl *= this.b;
		}
		var terrsdf = (relPos[1] - y) / 2;
		
		return Math.max(boxsdf, terrsdf);
	}
	
	serialize() {
		return `TERRAIN${super.serialize()}~${this.ampl}~${this.freq}~${this.n}~${this.a}~${this.b}`;
	}
	
	serializeGPU() {
		return [null, this.rx, this.ry, this.rz, this.n, this.ampl, this.freq, this.a, this.b];
	}
}

class Shell extends Scene3dObject {
	static type = TYPE_SHELL;
	//like sphere but the inside is hollow
	constructor(posRot, r, thickness) {
		super(posRot);
		this.r = r;
		this.h = thickness;
	}
	
	bounds() {
		const re = this.r + this.h;
		return bounds_expand(bounds_gen(this.pos, re + this.ex, re + this.ey, re + this.ez, quatIdentity()),this.bAugAmt());
	}
	
	distanceToPos(pos) {
		const sphereDist = getDistancePos(pos, this.pos) - this.r;
		return Math.abs(sphereDist) - this.h;
	}
	
	serialize() {
		return `SHELL${super.serialize()}${this.r}~${this.h}`;
	}
	
	serializeGPU() {
		return [null, this.r, this.h];
	}
}

class Sphere extends Scene3dObject {
	static type = TYPE_SPHERE;
	constructor(posRot, r) {
		super(posRot)
		this.r = r;
	}
	
	bounds() {
		return bounds_expandU(bounds_expand(
			bounds_gen(this.pos, this.r + this.ex, this.r + this.ey, this.r + this.ez, this.quat),
			this.bAugAmt()), 10*(this.material.type == M_GRAVITY));
	}

	distanceToPos(pos) {
		return getDistancePos(pos, this.pos) - this.r;
	}

	serialize() {
		return `SPHERE${super.serialize()}${this.r}`;
	}
	
	serializeGPU() {
		return [this.r];
	}
}

class Blobble extends Sphere {
	static type = TYPE_BLOB;
	constructor(posRot, r) {
		super(posRot, r);
	}

	serialize() {
		return `BLOB${super.serialize().slice(6)}`;
	}
}

class Singularity extends Sphere {
	static type = TYPE_SINGULARITY;
	constructor(posRot, r, mass) {
		super(posRot, null, N_FOG, r);
		this.mass = mass;
		this.material = new M_Gravity(0, 0, 0, 1);
		this.material.syncWith(this);
	}
	
	serialize() {
		var sup = super.serialize().split(`|`);
		return `SINGULARITY${sup[0].slice(6)}||${sup[2]}~${this.mass}`;
	}
}

class Voxel extends Scene3dObject {
	static type = TYPE_VOXEL;
	constructor(posRot, r, c1, c2, c3, c4, c5, c6, c7, c8) {
		super(posRot);
		this.r = r;
		this.c = [c1, c2, c3, c4, c5, c6, c7, c8];
	}

	bAxes() {
		return [this.r + this.ex, this.r + this.ey, this.r + this.ez];
	}
	
	distanceToPos(pos) {
		const relPos = this.relPos(pos);
		const d = this.r * 2;
		const halfD = this.r;
		var relX = relPos[0];
		var relY = relPos[1];
		var relZ = relPos[2];
	
		const x = Math.max(0, Math.abs(relX) - halfD);
		const y = Math.max(0, Math.abs(relY) - halfD);
		const z = Math.max(0, Math.abs(relZ) - halfD);
		const boxSDF = Math.sqrt(x * x + y * y + z * z);
		
		//put into percentage coordinates
		relX = (relX / d) + 0.5;
		relY = (relY / d) + 0.5;
		relZ = (relZ / d) + 0.5;
		
		//interpolate
		const cc = this.c;
		const A = linterp(cc[0], cc[4], relY);
		const B = linterp(cc[1], cc[5], relY);
		const C = linterp(cc[2], cc[6], relY);
		const D = linterp(cc[3], cc[7], relY);
		
		const voxelSDF = halfD * linterp(linterp(A, B, relX), linterp(D, C, relX), relZ);
		return Math.max(boxSDF, voxelSDF);
	}
	
	serialize() {
		const c = this.c;
		return `VOXEL${super.serialize()}${this.r * 2}~${c[0]}~${c[1]}~${c[2]}~${c[3]}~${c[4]}~${c[5]}~${c[6]}~${c[7]}`
	}
	
	serializeGPU() {
		return [this.r * 2, ...this.c];
	}
}
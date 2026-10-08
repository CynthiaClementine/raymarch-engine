

class Camera {
	constructor(world, pos) {
		this.world = world;
		this.pos = pos;
		this.quat = quatIdentity();
	}

	/**
	 * Returns the camera's basis vectors (right/X, up/Y, forward/Z).
	 * @returns {Object} `{right: Pos, up: Pos, forward: Pos}` (each is a normalized Pos vector)
	 */
	basis() {
		return {
			right:	quatRotate([1, 0, 0], this.quat),
			up:		quatRotate([0, 1, 0], this.quat),
			forward:quatRotate([0, 0, 1], this.quat)
		};
	}
	
	matrix() {
		var cxDir = quatRotate([1, 0, 0], this.quat);
		var cyDir = quatRotate([0, 1, 0], this.quat);
		var czDir = quatRotate([0, 0, 1], this.quat);
	
		return [
			cxDir[0], cxDir[1], cxDir[2],
			cyDir[0], cyDir[1], cyDir[2],
			czDir[0], czDir[1], czDir[2]
		];
	}
	
	tick() {
		//update GPU with current data
		gl.uniform3fv(uCamPos, Array.from(this.pos));
		gl.uniformMatrix3fv(uCamRot, false, this.matrix());
		gl.uniform1i(uCamWorld, this.world.id);
	}
}

class Player {
	constructor(world, pos, theta, phi) {
		this.world = world;
		this.pos = pos;
		this.dPos = Pos(0, 0, 0);
		this.aPos = Pos(0, 0, 0);
		this.dMax = 4;
		
		this.inputs = Pos(0,0,0);

		//how fast the player accelerates
		this.accel = 0.2;
		this.accelStrafe = 0.15;
		this.jumpForce = 6;
		this.dashBase = 0.5;
		this.dashMult = 1.1;
		this.frictionBrake = 0.2;
		
		this.frictionGround = 0.1;
		this.frictionAir = 0.05;

		this.gravity = phys_grav;
		this.fallMax = 10;
		this.grounded = 0;
		this.maxGroundDot = 0.1;

		this.height = 9;
		this.eyeHeight = 7;
		this.width = 3;

		this.collider = new PhysStruct_Player(this.world, copyArr(this.pos, []), quatIdentity(), this.width, this.height / 2, this.width);

		this.colPoints = 16;
		this.possibleObjs = [];
		this.contactObjs = new Set();
		// this.colPanicThreshold = 0.75;
		this.mmtmFactor = 1 - (1 / Math.E);
		
		this.theta = theta ?? 0;
		this.phi = phi ?? 0;
		this.quat = quatFromEuler(this.theta, this.phi, 0);

		// this.colStrengthMult = 0.6;
		// this.colStrengthMax = 1.3;
	}

	express() {
		this.setCameraPos();
		var p = v3_sub(this.pos, this.dPos);
		var θ = pi * 1.5 - this.theta;
		var upPos = [1.1, 1, 2];
		var dnPos = [3.5, -4, 4];
		
		var p1 = polToXY(p[0],p[2], θ, upPos[0]);
		p1 = [p1[0], p[1] + upPos[1], p1[1]];
		var p2 = polToXY(p[0],p[2], θ, dnPos[0]);
		p2 = [p2[0], p[1] + dnPos[1], p2[1]];

		var set = (debug_flags.collisionDots ? this.collider.express() : []);
		var obj = createDescribedObject(TYPE_DISH, {
			pos: Pos(...p1),
			posEnd: Pos(...p2),
			offP: Pos(...v3_sub(p2, p1)),
			r: upPos[2],
			ringR: dnPos[2],
			material: new M_Plexiglass(128, 128, 255, 100),
			parent: this,
			intangible: true,
		});
		return set.concat(obj);
	}
	
	calcPossibleObjs() {
		const tMax = this.trueMax;
		this.possibleObjs = this.world.bvh.objectsInBox(v3_subS(this.pos, tMax), v3_addS(this.pos, tMax));
		this.possibleObjs = this.possibleObjs.filter(a => !(a.intangible));
	}

	jump() {
		console.log(`jumping, ${JSON.stringify([[0, this.jumpForce, 0]])}`);
		this.inputs[1] = 0;
		this.grounded = 0;
		return [0, this.jumpForce, 0];
	}

	dash() {
		var speed = getDistancePos(this.dPos, Pos(0, 0, 0));
		if (speed > this.accel && speed < this.dashBase) {
			this.dPos = normalize(this.dPos);
			mulrementS(this.dPos, this.dashBase);
		}
		mulrementS(this.dPos, this.dashMult);
		return [0,0,0];
	}

	tick() {
		//forces come in the form [x, y, z, strength]
		var xHat = rotate(1, 0, -this.theta);
		xHat = [xHat[0], 0, xHat[1]];
		var zHat = rotate(0, 1, -this.theta);
		zHat = [zHat[0], 0, zHat[1]];
		// var dHat = normalize(this.dPos);
		
		var stableForces = this.calcStableForces(xHat, zHat);
		this.collider.pullState(this, stableForces);
		this.collider.physStep(1);
		// this.collider.physStep(1/2);
		this.collider.pushState(this);

		//update grounding
		this.grounded = clamp(this.grounded - 1, 0, player_coyote);

		loading_world.shouldRegen = true;
	}

	calcStableForces(xHat, zHat) {
		/**
		POSSIBLE FORCES:
		gravity
		strafing / walking / jumping
		
		 */
		var forces = [];
		forces = forces.concat(this.calcStable_input(xHat, zHat));
		forces = forces.concat(this.calcStable_fric(xHat, zHat));
		return forces;
	}

	calcStable_input(xHat, zHat) {
		var forces = [[0, -this.gravity, 0]];

		//jumping
		if (this.inputs[1] > 0) {
			forces.push(this.jump());
		}

		if (this.inputs[1] < 0) {
			forces.push(this.dash());
		}

		var xForce = this.accelStrafe * this.inputs[0];
		var zForce = this.accel * this.inputs[2];
		forces.push(v3_mulS(xHat, xForce));
		forces.push(v3_mulS(zHat, zForce));
		return forces;
	}

	calcStable_fric(xHat, zHat) {
		var forces = [];
		const dPosRel = copyArr(this.dPos, []);
		[dPosRel[0], dPosRel[2]] = rotate(dPosRel[0], dPosRel[2], this.theta);
		const dPosHz = [this.dPos[0], 0, this.dPos[2]];
		const hzHat = normalize(dPosHz);
		const inRange = magnitude(dPosHz) < this.dMax;

		const fricAmt = this.onGround() ? this.frictionGround : this.frictionAir;


		//side to side
		var hats = [xHat, [0, 1, 0], zHat];
		[0, 2].forEach((i => {
			if (this.inputs[i] * dPosRel[i] <= 0 || Math.abs(dPosRel[i]) > this.dMax) {
				forces.push(v3_mulS(hats[i], -dPosRel[i] * fricAmt));
			}
		}).bind(this));

		//ground friction
		// var gSpeed = magnitude(dPosHz);
		// if () {
		// 	forces.push(v3_mulS(hzHat, -gSpeed * this.frictionGround));
		// }

		//braking friction
		
		// const decelerating = dot([this.inputs[0] * this.accelStrafe, this.inputs[1]], this.dPos) <= 0

		// if (decelerating) {
		// 	this.dPos[num] *= this.frictionBrake;
		// }
		
		// if (magnitude(this.dPos) < this.dMin) {
		// 	this.forces.push(v3_mulS(dHat, -magnitude(dPosHz) * this.frictionBrake));
		// }
		// if ()
		// if (Math.abs(this.dPos[num]) < this.dMin) {
		// 	this.dPos[num] = 0;
		// }
		
		// console.log(`forcing ${v3_mulS(hzHat, -magnitude(dPosHz) * fricForce)}`);
		return forces;
	}

	setCameraPos() {
		var hBar = this.height / 2;
		camera.world = this.world;
		camera.pos = Pos(this.pos[0], this.pos[1] - hBar + this.eyeHeight, this.pos[2]);

		this.collider.quat = quatFromEuler(this.theta, 0, 0);
		this.quat = quatFromEuler(this.theta, this.phi, 0);
		copyArr(this.quat, camera.quat);
		
	}

	stealVelFrom(obj) {
		increment(this.dPos, obj.dPos);
	}
	
	portalTest(obj, coords) {
		var mat = obj.material;
		if (obj.distanceToPos(coords) < ray_nearDist && mat.constructor.name == "M_Portal") {
			if (worlds[mat.str]) {
				this.world = worlds[mat.str];
				increment(coords, mat.offset);
				return true;
			}
		}
		return false;
	}
	
	onGround() {
		var d = sceneSDF(this.collider.possibleObjs ?? [], v3_sub(this.pos, [0, this.height / 2, 0]));
		if (d[0] < player_stepHeight) {
			this.grounded = player_coyote;
			return true;
		}
		return false;
	}
}

class Player_Debug extends Player {
	constructor(world, pos, theta, phi) {
		super(world, pos, theta, phi);
		this.dMax = 10;
		this.accel = 0.2;
		this.accelStrafe = 0.15;
		this.accelLift = 0.3;
		
		this.frictionGround = 0;
		this.frictionAir = 0.15;
	}

	dash() {}

	calcStable_fric(xHat, zHat) {
		var forces = [];
		const dPosRel = copyArr(this.dPos, []);
		[dPosRel[0], dPosRel[2]] = rotate(dPosRel[0], dPosRel[2], this.theta);

		
		const fricAmt = this.onGround() ? this.frictionGround : this.frictionAir;
		var hats = [xHat, [0, 1, 0], zHat];

		//side to side
		[0, 1, 2].forEach((i => {
			if (this.inputs[i] * dPosRel[i] <= 0 || Math.abs(dPosRel[i]) > this.dMax) {
				forces.push(v3_mulS(hats[i], -dPosRel[i] * fricAmt));
			}
		}).bind(this));
		
		return forces;
	}

	calcStable_input(xHat, zHat) {
		if (this.inputs[1] < 0) {
			//figure out dashing
		}

		var xForce = this.accelStrafe * this.inputs[0];
		var yForce = this.accelLift * this.inputs[1];
		var zForce = this.accel * this.inputs[2];
		return [
			v3_mulS(xHat, xForce),
			v3_mulS([0, 1, 0], yForce),
			v3_mulS(zHat, zForce)
		];
	}
}

class Player_Noclip extends Player {
	constructor(world, pos, theta, phi) {
		super(world, pos, theta, phi);
		this.dMax = 6;
		this.accel = 0.6 ;
		this.accelStrafe = 0.6;
		this.accelLift = 0.6;

		this.frictionGround = 0;
		this.frictionAir = 0.1;

		this.collider = new PhysStruct_Null(this.world, copyArr(this.pos, []));
	}

	express() {
		this.setCameraPos();
		return [];
	}

	calcStable_input(xHat, zHat) {
		if (this.inputs[1] < 0) {
			//figure out dashing
		}

		var xForce = this.accelStrafe * this.inputs[0];
		var yForce = this.accelLift * this.inputs[1];
		var zForce = this.accel * this.inputs[2];
		return [
			v3_mulS(xHat, xForce),
			v3_mulS([0, 1, 0], yForce),
			v3_mulS(zHat, zForce)
		];
	}

	calcStable_fric(xHat, zHat) {
		var forces = [];
		const dPosRel = copyArr(this.dPos, []);
		[dPosRel[0], dPosRel[2]] = rotate(dPosRel[0], dPosRel[2], this.theta);

		
		const fricAmt = this.frictionAir;
		var hats = [xHat, [0, 1, 0], zHat];

		//side to side
		[0, 1, 2].forEach((i => {
			if (this.inputs[i] * dPosRel[i] <= 0 || Math.abs(dPosRel[i]) > this.dMax) {
				forces.push(v3_mulS(hats[i], -dPosRel[i] * fricAmt));
			}
		}).bind(this));
		
		return forces;
	}

	calcCollisionForces() {}
}
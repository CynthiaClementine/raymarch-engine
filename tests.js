function assert(bool, label) {
	label = label ?? `Assertion`;
	if (!bool) {
		throw new Error(`${label} failed.`);
	}
	console.log(`${label} passed.`);
}

function runTests() {
	var flags = {
		quat: true,
		quatSimple: true,
		quat2: true,
	};
	var ε = 0.1;

	if (flags.quatSimple) {
		var qX = quatFromAA(90*degToRad, [1, 0, 0]);
		var qY = quatFromAA(90*degToRad, [0, 1, 0]);
		var qZ = quatFromAA(90*degToRad, [0, 0, 1]);

		var pX = [4, 0, 0];
		var npX =[-4, 0, 0];
		var pY = [0, 4, 0];
		var npY =[0, -4, 0];
		var pZ = [0, 0, 4];
		var npZ =[0, 0, -4];

		var p;

		assert(getDistancePos(
			quatRotate([0, 0, 4], qY), 
			npX
		) < ε, `qSimple1`);

		assert(getDistancePos(
			quatRotate([0, 0, 4], qX), 
			pY
		) < ε, `qSimple2`);

		assert(getDistancePos(
			quatRotate([0, 0, 4], qZ), 
			pZ
		) < ε, `qSimple3`);

		assert(getDistancePos(
			quatRotate([0, 0, 4], quatMultiply(qZ, qX)), 
			pY
		) < ε, `qSimple4`);

		assert(getDistancePos(
			quatRotate([0, 0, 4], quatMultiply(qX, qZ)), 
			pX
		) < ε, `qSimple5`);

	}


	if (flags.quat) {
		var q = quatIdentity();
		assert(q[0] == 1 && magnitude(q) == 1);

		var qS = quatFromAA(45*degToRad, [0, 1, 0]);
		var qT = quatFromAA(45*degToRad, [1, 0, 0]);
		var qR = quatFromAA(45*degToRad, [0, 0, 1]);

		//basic rotation
		var ref = rotate(0, 2, pi / 4);
		assert(getDistance(...quatRotate([0, 0, 2], quatFromAA(pi / 4, [0, 1, 0])), ref[0], 0, ref[1]) < 0.01);

		//euler to quat
		var rot1 = [0.2, 0.6, 0.1];
		assert(getDistancePos(rot1, quatToEuler(quatFromEuler(...rot1))) < 0.1)

		//compression / decompression
		q = normalize(quatMultiply(qS, quatMultiply(qT, quatMultiply(qS, quatMultiply(qR, q)))));
		var q2 = unpackageQrot(packageQrot(q));
		assert(getDistance(q[0],q[1],q[2], q2[0],q2[1],q2[2]) < ε);

		q = normalize(quatMultiply(qS, quatMultiply(qR, quatMultiply(qT, quatMultiply(qR, q)))));
		var q2 = unpackageQrot(packageQrot(q));
		assert(getDistance(q[0],q[1],q[2], q2[0],q2[1],q2[2]) < ε);

		q = [0.30901699437494745,0,0.9510565162951535,0];
		var q2 = unpackageQrot(parseInt(packageQrot(q).toString(32), 32));
		assert(getDistance(q[0],q[1],q[2], q2[0],q2[1],q2[2]) < ε);
	}

	//test if quat orientation matches euler orientation
	if (flags.quat2) {
		function test_quatVEuler(q, id) {
			//method 1: use the quat directly
			var p1 = quatRotate([0, 0, 5], q);
	
			//method 2: convert to euler but do not simulate GPU packaging
			var p2 = [0, 0, 5];
			var [t, p, r] = quatToEuler(q);
			rotate3d(p2, t, p, r);
			
			//method 3: simulate GPU packaging process
			var p3 = [0, 0, 5];
			var eulerRep = quatToEuler(q);
			var package = packageRot(eulerRep[0], eulerRep[1], eulerRep[2]);
			buf32_float[0] = package;
			package = buf32_int[0];
			rotate3d(p3, degToRad*(package & 0x1FF), degToRad*(((package >> 9) & 0x1FF) - 90), degToRad*((package >> 18) & 0x1FF));
	
			var err = getDistancePos(p1, p2);
			var err2 = getDistancePos(p1, p3);
			if (err > ε) {
				console.log(`QvE p2 problem`, p1, p3, quatToEuler(q), err);
			}
			if (err2 > ε) {
				console.log(`QvE p3 problem`, p1, p2, quatToEuler(q), package, err2);
			}
			assert((err < ε) && (err2 < ε), `quat v. euler ${id}`);
		}

		test_quatVEuler([0.9996573249755573, 0, -0.026176948307873153, 0], `smNθ`);
		test_quatVEuler([0.9993908270190958, 0, 0.03489949670250097, 0], `smPθ`);
		//test_quatVEuler([0.3389639629220248, 0.5414842069937731, 0.7274722761452883, 0.2503644800216564], `arbYZ`);
	}
}
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
		quat2: true,
	};
	var ε = 0.1;
	





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
	
			//method 2: simulate GPU packaging process
			var p2 = [0, 0, 5];
			var eulerRep = quatToEuler(q);
			var package = packageRot(eulerRep[0], eulerRep[1], eulerRep[2]);
			buf32_float[0] = package;
			package = buf32_int[0];
			[p2[0], p2[2]] = rotate(p2[0], p2[2], -degToRad*(package         & 0x1FF));
			console.log(JSON.stringify(p2));
			[p2[1], p2[2]] = rotate(p2[1], p2[2],  degToRad*(((package >> 9)  & 0x1FF) - 90));
			console.log(JSON.stringify(p2));
			[p2[0], p2[1]] = rotate(p2[0], p2[1], -degToRad*((package >> 18) & 0x1FF));
			console.log(JSON.stringify(p2));
	
			var err = getDistancePos(p1, p2);
			console.log(p1, p2, quatToEuler(q), package, err);
			assert(err < ε, `quat v. euler ${id}`);
		}


		test_quatVEuler([0.9996573249755573, 0, -0.026176948307873153, 0], `smN`);
		test_quatVEuler([0.9993908270190958, 0, 0.03489949670250097, 0], `smP`);
	}
}
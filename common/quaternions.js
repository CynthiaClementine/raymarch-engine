
/**
A quaternion is a set of 4 numbers that represents rotations as an axis + angle.

x = RotationAxis.x * sin(RotationAngle / 2)

y = RotationAxis.y * sin(RotationAngle / 2)

z = RotationAxis.z * sin(RotationAngle / 2)

w = cos(RotationAngle / 2)
 */


function quatToMatrix(q) {
	const xx = q[0]*q[0];
	const yy = q[1]*q[1];
	const zz = q[2]*q[2];
	const ww = q[3]*q[3];

	const wx = q[3]*q[0];
	const wy = q[3]*q[1];
	const wz = q[3]*q[2];
	const xy = q[0]*q[1];
	const xz = q[0]*q[2];
	const yz = q[1]*q[2];

	return [
		[ww+xx-yy-zz, 2*(xy - wz), 2*(xz + wy), 0],
		[2*(xy + wz), ww-xx+yy-zz, 2*(yz - wx), 0],
		[2*(xz - wy), 2*(yz + wx), ww-xx-yy+zz, 0],
		[0,           0,           0,           1]
	];
}

//from wikipedia, I might be wrong
function aaFromQuat(q) {
	const len = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2]);
	const axis = [q[0] / len, q[1] / len, q[2] / len];
	const theta = 2 * Math.atan2(len, q[3]);

	return [axis, theta];
}

function quatFromAA(axis, angle) {
	angle /= 2;
	return [
		axis[0] * Math.sin(angle),
		axis[1] * Math.sin(angle),
		axis[2] * Math.sin(angle),
		Math.cos(angle),
	];
}

function quatMultiply(q1, q2) {
	return [
		q1[3]*q2[3] - q1[0]*q2[0] - q1[1]*q2[1] - q1[2]*q2[2],
		q1[3]*q2[0] + q1[0]*q2[3] + q1[1]*q2[2] - q1[2]*q2[1],
		q1[3]*q2[1] - q1[0]*q2[2] + q1[1]*q2[3] + q1[2]*q2[0],
		q1[3]*q2[2] + q1[0]*q2[1] - q1[1]*q2[0] + q1[2]*q2[3]
	];
}

//DON'T USE THIS, THIS CHANGES THE LENGTH OF THE QUATS
function quatAdd(q1, q2) {
	return [
		q1[0] + q2[0],
		q1[1] + q2[1],
		q1[2] + q2[2],
		q1[3] + q2[3],
	]
}

function quatIdentity() {
	return [0, 0, 0, 1];
}
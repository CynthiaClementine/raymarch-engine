function increment(source, mod) {
	source[0] += mod[0];
	source[1] += mod[1];
	source[2] += mod[2];
}

function decrement(source, mod) {
	source[0] -= mod[0];
	source[1] -= mod[1];
	source[2] -= mod[2];
}

function mulrement(source, mod) {
	source[0] *= mod[0];
	source[1] *= mod[1];
	source[2] *= mod[2];
}

function recrement(source, mod) {
	source[0] /= mod[0];
	source[1] /= mod[1];
	source[2] /= mod[2];
}


function incrementS(source, n) {
	source[0] += n;
	source[1] += n;
	source[2] += n;
}

function decrementS(source, n) {
	source[0] -= n;
	source[1] -= n;
	source[2] -= n;
}

function mulrementS(source, n) {
	source[0] *= n;
	source[1] *= n;
	source[2] *= n;
}

function recrementS(source, n) {
	source[0] /= n;
	source[1] /= n;
	source[2] /= n;
}


function v3_add(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function v3_sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function v3_mul(a, b) {
	return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function v3_div(a, b) {
	return [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
}


function v3_addS(a, n) {
	return [a[0] + n, a[1] + n, a[2] + n];
}

function v3_subS(a, n) {
	return [a[0] - n, a[1] - n, a[2] - n];
}

function v3_mulS(a, n) {
	return [a[0] * n, a[1] * n, a[2] * n];
}

function v3_divS(a, n) {
	return [a[0] / n, a[1] / n, a[2] / n];
}
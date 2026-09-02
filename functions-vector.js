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
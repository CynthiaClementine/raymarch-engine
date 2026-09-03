/* 
MATERIAL TYPES
0     color
2     rubber
3     normal
10    glass
11    ghost
12    plexiglass
20    portal
25    gravity
30    mirror
40    light
*/

class Material {
	static type = -1;
	constructor(color, bounciness) {
		this.color = color ?? Color4(255, 0, 255, 255);
		this.bounciness = bounciness ?? 0;
		this.type = this.constructor.type;
	}
	
	applySDFEffect(val) {
		return val;
	}
	
	applyNearEffect(ray) {}
	
	applyHitEffect(ray, obj) {
		return true;
	}
	
	//steal properties from parent object if necessary
	syncWith(object) {}
	
	pushOut(ray, object, recursed) {
		const pos = ray.pos;
		const norm = object.normalAt(pos);
		const dist = ray_minDist * 2 - ray.localDist;
		increment(pos, v3_mulS(norm, dist));
		
		ray.localDist = object.distanceToPos(pos);
		if (ray.localDist < ray_minDist) {
			if (!recursed) {
				this.pushOut(ray, object, true);
			}
		}
	}
	
	serialize() {
		console.error(`serialization not implemented for material ${this.constructor.name}!`);
		return `___`;
	}
	
	serializeGPU() {
		return [null, null, null, 
				this.color[0] / 255, this.color[1] / 255, this.color[2] / 255, this.color[3] / 255];
	}
}

class M_Color extends Material {
	static type = M_COLOR;
	constructor(r, g, b) {
		super(Color4(r, g, b, 255), 0.3);
	}
	
	applyHitEffect(ray, obj) {
		this.pushOut(ray, obj);
		return true;
	}
	
	serialize() {
		return `color:${this.color[0]}~${this.color[1]}~${this.color[2]}`;
	}

	serializeGPU() {
		return [this.color[0] / 255, this.color[1] / 255, this.color[2] / 255];
	}
}

class M_Gravity extends Material {
	static type = M_GRAVITY;
	constructor(x, y, z, mass) {
		super(Color4(10,0,0,200));
		this.bounciness = 0;
		this.pos = Pos(x, y, z);
		this.mass = mass;
	}
	
	applyHitEffect(ray, obj) {}
	
	syncWith(obj) {
		this.pos = obj.pos;
		this.mass = obj.mass;
	}
	
	serialize() {
		return `gravity:${this.pos[0]}~${this.pos[1]}~${this.pos[2]}~${this.mass}`;
	}
	
	
	serializeGPU() {
		return [null, null, null, 
				...this.pos, this.mass];
	}
}

class M_Ghost extends Material {
	static type = M_GHOST;
	constructor(r, g, b, opacity) {
		super(Color4(r, g, b, opacity), 0.1);
	}
	
	serialize() {
		return `ghost:${this.color[0]}~${this.color[1]}~${this.color[2]}~${this.color[3]}`;
	}

	serializeGPU() {
		return [null, null, this.color[3] / 255, 
				this.color[0] / 255, this.color[1] / 255, this.color[2] / 255];
	}
}

class M_Glass extends Material {
	static type = M_GLASS;
	constructor(r, g, b, opacity, density) {
		super(Color4(r, g, b, opacity), 0.1);
		this.density = density ?? 1;
	}
	
	applyHitEffect(ray) {
		return false;
	}
	
	serialize() {
		return `glass:${this.color[0]}~${this.color[1]}~${this.color[2]}~${this.color[3]}~${this.density}`;
	}
	
	serializeGPU() {
		return [this.density, null, null, 
				this.color[0] / 255, this.color[1] / 255, this.color[2] / 255, this.color[3] / 255];
	}
}

class M_Plexiglass extends Material {
	static type = M_PLEXI;
	constructor(r, g, b, opacity) {
		super(Color4(r, g, b, opacity), 0.1);
	}
	
	applyHitEffect(ray) {
		return false;
	}
	
	serialize() {
		return `plexi:${this.color[0]}~${this.color[1]}~${this.color[2]}~${this.color[3]}`;
	}
}

class M_Light extends Material {
	static type = M_LIGHT;
	/*
		all lights have a 1/r^2 brightness curve. Luminosity sets the maximum distance at which brightness = ε
	 */
	constructor(r, g, b, luminosity) {
		super(Color4(r, g, b, 255), 0);
		this.epsilon = 1 / 512;
		this.lumi = luminosity;
	}

	syncWith(obj) {
	}

	serialize() {
		return `light:${this.color[0]}~${this.color[1]}~${this.color[2]}~${this.lumi}`;
	}

	serializeGPU() {
		//max. distance is sent to the GPU
		return [null, null, Math.sqrt(this.lumi / this.epsilon),
				this.color[0] / 255, this.color[1] / 255, this.color[2] / 255];
	}
}

class M_Normal extends Material {
	static type = M_NORMAL;
	constructor() {
		super(Color4(0, 0, 0, 255), 0);
	}
	
	applyNearEffect(ray) {}
	
	applyHitEffect(ray, object) {
		return true;
	}
	
	serialize() {
		return `normal`;
	}
}

class M_Portal extends Material {
	static type = M_PORTAL;
	constructor(newWorldName, posOffset, opacity) {
		super(Color4(255, 255, 255, 255), 0);
		this.str = newWorldName;
		this.offset = Pos(...posOffset);
		this.a = opacity ?? 0;
	}
	
	applyNearEffect(ray) {
		//move tracking rays earlier
		if (worlds[this.str] && !ray.color) {
			ray.world = worlds[this.str];
			increment(ray.pos, this.offset);
		}
	}
	
	applyHitEffect(ray) {
		// this.applyNearEffect(ray);
		if (worlds[this.str]) {
			ray.world = worlds[this.str];
			increment(ray.pos, this.offset);
		}
		ray.localDist = ray_minDist * 2;
		return false;
	}
	
	tick() {
		if (worlds[this.str] && worlds[this.str] != loading_world) {
			worlds[this.str].tick();
		}
	}
	
	serialize() {
		return `portal:${this.str}~[${this.offset}]~${this.a}`;
	}
	
	serializeGPU() {
		//indirection on newWorld reference so that it works even before syncing
		var newWorld = worlds[this.str] ?? {id: 9999};
		return [...this.offset, 
				newWorld.id, this.a / 255];
	}
}

class M_Mirror extends Material {
	static type = M_MIRROR;
	constructor(r, g, b, absorbance) {
		super(Color4(r, g, b, absorbance), 0.1);
	}
	
	applyNearEffect(ray) {}
	
	applyHitEffect(ray, parent) {
		return true;
	}
	
	serialize() {
		return `mirror:${this.color[0]}~${this.color[1]}~${this.color[2]}~${this.color[3]}`;
	}
}

class M_Rubber extends Material {
	static type = M_RUBBER;
	constructor() {
		super(Color4(47, 48, 66, 255), 1);
		this.lumi = 4;
	}
	
	applyNearEffect(ray) {}
	
	applyHitEffect(ray) {
		ray.localDist = ray_minDist * 2;
		return true;
	}
	
	serialize() {
		return `rubber`;
	}

	serializeGPU() {
		return [];
	}
}

class M_Texture extends Material {
	static type = M_TEXTURE;
	constructor(materialID, scale, isRelative, blendFactor) {
		super(Color4(255, 0, 255, 255), 0.2);
		this.mat = materialID;
		this.scale = scale ?? 1.0;
		this.rel = +isRelative ?? true;
		this.blend = blendFactor ?? 0.5;
	}

	applyNearEffect(ray) {}
	
	applyHitEffect(ray) {
		return true;
	}

	serialize() {
		return `texture:${this.mat}~${this.scale}~${+this.rel}~${this.blend}`;
	}

	serializeGPU() {
		return [null, null, null,
				this.mat, this.scale, this.rel, this.blend];
	}
}



var map_strMat = {
	"color": M_Color,
	"ghost": M_Ghost,
	"glass": M_Glass,
	"light": M_Light,
	"mirror": M_Mirror,
	"normal": M_Normal,
	"plexi": M_Plexiglass,
	"portal": M_Portal,
	"gravity": M_Gravity,
	"rubber": M_Rubber,
	"texture": M_Texture,
};
var map_matStr = Object.fromEntries(Object.entries(map_strMat).map(a => [a[1].name, a[0]]));

var map_typeMat = {};
Object.entries(map_strMat).forEach(e => {
	map_typeMat[e.type] = e;
});
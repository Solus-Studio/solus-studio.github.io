const spine = [
  [-1.26, -.88, .82], [-1.48, -.23, .36], [-1.22, .68, -.02],
  [-.59, 1.19, .01], [.19, 1.15, -.31], [.78, .65, -.62],
  [.80, .06, -.68], [.12, -.21, -.19], [-.59, -.09, .46],
  [-.58, -.70, .80], [.09, -1.14, .55], [.98, -.86, -.08],
  [1.30, -.16, -.23], [1.21, .58, .14]
];

const tau = 2 * Math.PI;
const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const scale = (v, factor) => v.map(value => value * factor);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = vector => scale(vector, 1 / Math.max(.00001, Math.hypot(...vector)));
const clamp = value => Math.min(1, Math.max(0, value));

function curve(t) {
  const step = clamp(t) * (spine.length - 1);
  const index = Math.min(Math.floor(step), spine.length - 2);
  const u = step - index;
  const a = spine[Math.max(0, index - 1)];
  const b = spine[index];
  const c = spine[index + 1];
  const d = spine[Math.min(spine.length - 1, index + 2)];
  return b.map((value, n) => value + .5 * u * (c[n] - a[n] + u * (
    2 * a[n] - 5 * value + 4 * c[n] - d[n] + u * (3 * value - a[n] - 3 * c[n] + d[n])
  )));
}

function surface(t, angle, flex) {
  const center = curve(t);
  const tangent = unit(sub(curve(t + .0004), curve(t - .0004)));
  const transverse = unit(cross([0, 0, 1], tangent));
  const face = unit(cross(tangent, transverse));
  const twist = .38 + 3.31 * t - .92 * Math.sin(tau * t + .24) + .23 * Math.sin(2 * tau * t);
  const across = add(scale(transverse, Math.cos(twist)), scale(face, Math.sin(twist)));
  const up = cross(tangent, across);
  const tip = .24 + .76 * Math.pow(Math.sin(Math.PI * t), .48);
  const width = tip * (.36 + .075 * Math.sin(tau * t * 1.6 - .42));
  const thickness = tip * (.066 + .024 * Math.cos(tau * t - .72));
  const widthSide = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), .42);
  const heightSide = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), .60);
  const crease = .081 * tip * widthSide * widthSide * Math.sin(tau * t + 1.16);
  const position = add(center, add(scale(across, widthSide * width), scale(up, heightSide * thickness + crease)));
  // The second pose bends the same continuous strip along its length.
  position[0] += flex * .19 * Math.sin(tau * t + .42);
  position[1] += flex * .16 * Math.sin(tau * t * 1.66 - .58);
  position[2] += flex * .37 * Math.cos(tau * t * 1.14 + .85);
  return position;
}

function mesh() {
  const length = 180;
  const sides = 48;
  const stride = sides + 1;
  const vertices = [];
  const indices = [];

  for (let ring = 0; ring <= length; ring++) {
    const t = ring / length;
    for (let side = 0; side <= sides; side++) {
      const u = side / sides;
      const angle = u * tau;
      for (const flex of [0, 1]) {
        const position = surface(t, angle, flex);
        const lengthwise = sub(surface(clamp(t + .0005), angle, flex), surface(clamp(t - .0005), angle, flex));
        const around = sub(surface(t, angle + .002, flex), surface(t, angle - .002, flex));
        vertices.push(...position, ...unit(cross(around, lengthwise)));
      }
      vertices.push(t, u);
      if (ring < length && side < sides) {
        const a = ring * stride + side;
        const b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  // Close both cut ends of the machined strip.
  for (let side = 1; side < sides - 1; side++) {
    indices.push(0, side + 1, side);
    const last = length * stride;
    indices.push(last, last + side, last + side + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aBentPosition;
  attribute vec3 aBentNormal;
  attribute vec2 aUV;
  uniform vec3 uAngles;
  uniform vec3 uShift;
  uniform float uFlex;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUV;

  vec3 rotate(vec3 p) {
    vec3 c = cos(uAngles), s = sin(uAngles);
    p.yz = mat2(c.x, s.x, -s.x, c.x) * p.yz;
    p.xz = mat2(c.y, s.y, -s.y, c.y) * p.xz;
    p.xy = mat2(c.z, s.z, -s.z, c.z) * p.xy;
    return p;
  }

  void main() {
    vPosition = rotate(mix(aPosition, aBentPosition, uFlex)) + uShift;
    vNormal = rotate(normalize(mix(aNormal, aBentNormal, uFlex)));
    vUV = aUV;
    float depth = 6.2 - vPosition.z;
    gl_Position = vec4(2.94 * vPosition.xy, depth * 1.02 - .2, depth);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUV;
  uniform float uProgress;

  float band(vec3 ray, vec3 normal, vec3 axis, float width, float height) {
    vec3 tangent = normalize(cross(normal, axis));
    float forward = max(dot(ray, normal), 0.0);
    vec2 offset = vec2(dot(ray, tangent) / width, dot(ray, axis) / height);
    return exp(-dot(offset, offset)) * smoothstep(0.0, .58, forward);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(126.57, 391.24))) * 46289.4);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 eye = normalize(vec3(0.0, 0.0, 6.2) - vPosition);
    if (dot(eye, normal) < 0.0) normal = -normal;
    vec3 ray = reflect(-eye, normal);

    // Reflections of long softboxes instead of point lights. Their geometry
    // makes the highlights stretch over the wide faces and cling to the bevels.
    vec3 key = normalize(vec3(-.78, .48, .60));
    vec3 amber = normalize(vec3(.82, .38, -.57));
    vec3 acid = normalize(vec3(.61, -.51 + .33 * uProgress, .50));
    vec3 rim = normalize(vec3(-.49, -.55, -.67));
    float soft = band(ray, key, normalize(cross(vec3(1.0, 0.0, 0.0), key)), .41, .82);
    float strip = band(ray, amber, normalize(cross(vec3(0.0, 1.0, 0.0), amber)), .18, .85);
    float green = band(ray, acid, normalize(cross(vec3(0.0, 1.0, 0.0), acid)), .11, .37);
    float edge = band(ray, rim, normalize(cross(vec3(0.0, 1.0, 0.0), rim)), .27, .57);
    float fill = .48 + .52 * max(0.0, dot(normal, key));
    float grazing = pow(1.0 - max(0.0, dot(eye, normal)), 2.0);

    float grooves = hash(vec2(floor(vUV.y * 590.0), 1.3));
    float grains = hash(floor(vec2(vUV.x * 493.0, vUV.y * 322.0)));
    float brushing = .87 + .22 * mix(grooves, grains, .34);
    float shaping = .73 + .27 * sin(vUV.x * 4.2 + 1.16);

    vec3 base = vec3(.103, .100, .083) * fill * shaping;
    vec3 reflection = soft * vec3(.89, .85, .73)
      + strip * vec3(.61, .52, .35)
      + edge * vec3(.57, .59, .50)
      + green * vec3(.43, .56, .06) * (.71 + .39 * uProgress);
    vec3 color = base + (reflection * brushing + .12 * grazing) * shaping;
    color += .048 * max(ray.y, 0.0) * vec3(1.04, 1.00, .84);
    color = pow(max(color, vec3(0.0)), vec3(.79));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function compile(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

export function createSculpture(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL unavailable');

  const program = gl.createProgram();
  const shaders = [compile(gl, vertexSource, gl.VERTEX_SHADER), compile(gl, fragmentSource, gl.FRAGMENT_SHADER)];
  for (const shader of shaders) gl.attachShader(program, shader);
  gl.linkProgram(program);
  for (const shader of shaders) gl.deleteShader(shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const geometry = mesh();
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
  for (const [index, name] of ['aPosition', 'aNormal', 'aBentPosition', 'aBentNormal', 'aUV'].entries()) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, index === 4 ? 2 : 3, gl.FLOAT, false, 14 * 4, index * 3 * 4);
  }

  const angles = gl.getUniformLocation(program, 'uAngles');
  const shift = gl.getUniformLocation(program, 'uShift');
  const flex = gl.getUniformLocation(program, 'uFlex');
  const progress = gl.getUniformLocation(program, 'uProgress');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  function draw(t) {
    const pixels = Math.min(1344, Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 1.5)));
    if (pixels !== canvas.width || pixels !== canvas.height) {
      canvas.width = canvas.height = pixels;
      gl.viewport(0, 0, pixels, pixels);
    }
    const drift = ease(t / .76);
    const lift = ease((t - .24) / .76);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(angles, -.11 + .73 * drift, -.13 + 1.44 * drift, -.24 + .87 * drift + .9 * lift);
    gl.uniform3f(shift, .20 * drift + .18 * lift, -.09 + 2.68 * lift, -.26 * lift);
    gl.uniform1f(flex, ease(t / .63));
    gl.uniform1f(progress, t);
    gl.drawElements(gl.TRIANGLES, geometry.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  return { draw };
}

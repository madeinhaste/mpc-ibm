// https://github.com/croquelois/sobol
const BITS = 52;
const SCALE = 2 << 51;
const MAX_DIMENSION = 21201;

let data;
export const ready = fetch('../data/new-joe-kuo-6.21201.txt')
    .then(r => r.text())
    .then(text => {
        //console.log(text);
        data = text;
        return SobolSequenceGenerator;
    });

function SobolSequenceGenerator(dim) {
  if (dim < 1 || dim > MAX_DIMENSION) throw new Error("Out of range dimension");
  this.dimension = dim;
  this.count = 0;
  var direction = (this.direction = []); /*of []*/
  this.x = [];
  this.zero = [];
  var tmp = [];
  for (var i = 0; i <= BITS; i++) tmp.push(0);
  for (var i = 0; i < dim; i++) {
    direction[i] = tmp.slice();
    this.x[i] = 0;
    this.zero[i] = 0;
  }

  console.assert(data);
  var lines = ("" + data).split("\n");

  for (var i = 1; i <= BITS; i++) direction[0][i] = 1 << (BITS - i);
  for (var d = 1; d < dim; d++) {
    var cells = lines[d].split(/\s+/).map(function(str) {
      return parseInt(str, 10);
    });
    var s = cells[1];
    var a = cells[2];
    var m = [0];
    for (var i = 0; i < s; i++) m.push(cells[3 + i]);
    for (var i = 1; i <= s; i++) direction[d][i] = m[i] << (BITS - i);
    for (var i = s + 1; i <= BITS; i++) {
      direction[d][i] = direction[d][i - s] ^ (direction[d][i - s] >> s);
      for (var k = 1; k <= s - 1; k++)
        direction[d][i] ^= ((a >> (s - 1 - k)) & 1) * direction[d][i - k];
    }
  }
}

SobolSequenceGenerator.prototype.nextVector = function() {
  var v = [];
  if (this.count == 0) {
    this.count++;
    return this.zero.slice();
  }
  var c = 1;
  var value = this.count - 1;
  while ((value & 1) == 1) {
    value >>= 1;
    c++;
  }
  for (var i = 0; i < this.dimension; i++) {
    this.x[i] ^= this.direction[i][c];
    v[i] = this.x[i] / SCALE;
  }
  this.count++;
  return v;
};

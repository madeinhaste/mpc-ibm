import '@babel/polyfill';
//import 'core-js/stable';
//import 'regenerator-runtime/runtime';

const dbg = document.querySelector('.debug');

console.log('hello from test');

(async () => {
    const text = `hello, ${new Date}, world!`;
    console.log(text);
    dbg.innerHTML += text + '\n';
})();

const foo = 1;
const bar = 2;
const baz = 3;

let obj = {foo, bar, baz};
Object.assign(obj, {goo: 123});

for (let [k, v] of Object.entries(obj)) {
    console.log(k, v);
    dbg.innerHTML += `${k}: ${v}\n`;
}


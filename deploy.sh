#npx rollup -c

rm -rfv dist/
mkdir dist

cp -a public/airplane.html dist/index.html
cp -a public/cimon.html dist/
cp -a public/cimon-lipsync.html dist/

mkdir dist/data
mkdir dist/bundles
mkdir dist/images
mkdir dist/sounds

cp -a public/bundles/airplane.bundle.js dist/bundles/
cp -a public/bundles/trails-worker.bundle.js dist/bundles/
cp -a public/images/{cloud10.png,cockpit.png,sky256.png,sky3.jpg} dist/images/
cp -a public/data/* dist/data/
cp -a public/sounds/* dist/sounds/

cp -a public/bundles/cimon.bundle.js dist/bundles/
cp -a public/bundles/cimon-lipsync.bundle.js dist/bundles/
mkdir -p dist/images/cimon/faces
cp -a public/images/cimon/*.{png,jpg} dist/images/cimon/
cp -a public/images/cimon/faces/*.{png,jpg} dist/images/cimon/faces/

#rsync -avL public/* dist/
archive=dist-`date +%y%m%d`.zip
zip -r "$archive" dist/
mv "$archive" dist/
rsync -avL dist/ madeinhaste:projects/mpc-ibm/

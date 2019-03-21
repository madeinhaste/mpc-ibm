npx rollup -c

rm -rfv dist/
mkdir dist

cp -a public/airplane.html dist/index.html
cp -a public/cimon.html dist/
cp -a public/cimon-lipsync.html dist/

mkdir dist/data
mkdir dist/bundles
mkdir dist/images
mkdir dist/sounds
mkdir dist/styles
mkdir dist/videos

cp -a public/bundles/airplane.bundle.js dist/bundles/
cp -a public/bundles/trails-worker.bundle.js dist/bundles/

cp -a public/images/{cloud10.png,cockpit.png} dist/images/
cp -a public/images/loc00184-22-*.jpg dist/images/

cp -a public/data/* dist/data/
cp -a public/sounds/* dist/sounds/

cp -a public/bundles/cimon-app.bundle.js dist/bundles/
cp -a public/bundles/cimon-lipsync.bundle.js dist/bundles/
mkdir -p dist/images/cimon/faces
mkdir -p dist/images/cimon/envmap
cp -a public/images/cimon/*.{png,jpg} dist/images/cimon/
cp -a public/images/cimon/faces/*.png dist/images/cimon/faces/
cp -a public/images/cimon/envmap/*.png dist/images/cimon/envmap/

cp -a public/bundles/rotation-lock-app.bundle.js dist/bundles/
cp -a public/bundles/scenes-app.bundle.js dist/bundles/
cp -a public/rotate.html dist/
cp -a public/scenes.html dist/

cp -a public/styles/rotate.css dist/styles/
cp -a public/styles/scenes.css dist/styles/
cp -a public/videos/smartscenes-190313.mp4 dist/videos/

archive=dist-`date +%y%m%d`.zip
zip -r "$archive" dist/
mv "$archive" dist/
rsync -avL dist/ madeinhaste:projects/mpc-ibm/

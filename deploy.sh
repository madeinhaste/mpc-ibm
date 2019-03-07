npx rollup -c

rm -rfv dist/
mkdir dist

cp -a public/airplane.html dist/index.html

mkdir dist/data
mkdir dist/bundles
mkdir dist/images
mkdir dist/sounds

cp -a public/bundles/airplane.bundle.js dist/bundles/
cp -a public/bundles/trails-worker.bundle.js dist/bundles/
cp -a public/images/{cloud10.png,cockpit.png,sky256.png,sky3.jpg} dist/images/
cp -a public/data/* dist/data/
cp -a public/sounds/* dist/sounds/

#rsync -avL public/* dist/
archive=dist-`date +%y%m%d`.zip
zip -r "$archive" dist/
mv "$archive" dist/
rsync -avL dist/ madeinhaste:projects/mpc-ibm/

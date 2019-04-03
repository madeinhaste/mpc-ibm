rollup -c ./rollup-build.config.js
cp -v public/bundles/rich-apps.bundle.js ../ibm-smart-scenes/src/js/
rsync -av public/assets/rich/ ../ibm-smart-scenes/src/assets/rich/

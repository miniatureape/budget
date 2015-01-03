T="$(date +%s)"

zip old-deploys/replaced-by-$T.zip deploy/*
rm -rf deploy/font/
rm deploy/*

browserify main.js -o deploy/main.$T.js
cp *.css deploy/
cp -r font/ deploy/font/
sed s/TIMESTAMP/$T/g index.html > deploy/index.html
sed s/TIMESTAMP/$T/g /home/justin/projects/miniperdiem/cache.manifest.template > /home/justin/projects/miniperdiem/deploy/cache.manifest


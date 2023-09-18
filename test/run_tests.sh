for file in ./test/**/*.test.ts; do
  tsx --test "$file"
done
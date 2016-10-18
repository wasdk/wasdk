#include <stdio.h>
struct Point {
  int x;
  int y;
  int add(Point *point) {
    return point->x + point->y;
  }
  int mul(Point a, Point b) {
    return a.x + b.y;
  }
};

Point *make_point() {
  return new Point();
}

int main() {
  for (int i = 0; i < 100; i++) {
    printf("Hello World! %i\n", i);
  }
  return make_point()->x;
}
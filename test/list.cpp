#include <stddef.h>
#include <emscripten.h>
#include <stdlib.h>

struct Node {
  int data;
  Node *next;
};

extern void *malloc(size_t size);

extern "C" {
  void init(struct Node *head, int data) {
    head->data = data;
    head->next = NULL;
  }

  void addNode(struct Node *head, int data) {
    Node *node = new Node();
    node->data = data;
    node->next = NULL;
    Node *curr = head;
    while (curr) {
      if (curr->next == NULL) {
        curr->next = node;
        return;
      }
      curr = curr->next;
    }
  }
}

/*
bool deleteNode(struct Node **head, struct Node *node) {
  Node *curr = *head;
  if (node == *head) {
    *head = curr->next;
    delete node;
    return true;
  }
  while (curr) {
    if (curr->next == node) {
        curr->next = node->next;
        delete node;
        return true;
    }
    curr = curr->next;
  }
  return false;
}
*/
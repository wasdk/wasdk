#include <stdlib.h>

extern void *malloc(size_t size);
extern void print(int val);

struct Node {
  int data;
  struct Node *next;
};

struct List {
  struct Node *root;
};

void initList(struct List *head)
{
  head->root = NULL;
}

struct Node* addNode(struct List *head, int data)
{
  struct Node *node = (struct Node *)malloc(sizeof (struct Node));
  struct Node **curr = &(head->root);
  node->data = data;
  node->next = NULL;
  while (*curr)
    curr = &((*curr)->next);
  *curr = node;
  return node;
}

void test()
{
  struct List list;
  initList(&list);
  for (int i = 0; i < 3; i++)
    addNode(&list, i);

  for (struct Node *p = list.root; p; p = p->next)
    print((int)(void*)p);
}

/*
bool deleteNode(struct List *list, struct Node *node) {
  struct Node *curr = *head;
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